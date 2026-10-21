import { supabase } from './supabase';
import type { BackupPhoto } from '../types';

// Photos attached to operations in the expense app. They come with its backups and live in the
// account's file store: the private "photos" bucket in Supabase Storage, a folder per user that
// only its owner reaches (supabase_migration_photos.sql). The statement holds no pictures, only
// each operation's photo names, so it stays as light as it was; a photo is fetched when it's opened.

const BUCKET = 'photos';
const PAGE = 1000;

// Every name this app gives a photo: the SHA-256 of the file and its kind (lib/backup).
const PHOTO_NAME = /^[0-9a-f]{64}\.(jpg|png|webp|gif|heic)$/;

// Pictures this page already holds: those of the backup imported here, and those fetched once.
const held = new Map<string, Blob>();

/** A backup's photos, shown on this device straight away, before (or without) the account having them. */
export function keepPhotos(photos: BackupPhoto[]): void {
    for (const p of photos) held.set(p.name, new Blob([p.data as Uint8Array<ArrayBuffer>], { type: p.type }));
}

/** On sign-out: the next account sees only its own photos. */
export function forgetPhotos(): void {
    held.clear();
}

async function storedNames(userId: string): Promise<Set<string>> {
    const names = new Set<string>();
    for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await supabase.storage.from(BUCKET).list(userId, { limit: PAGE, offset });
        if (error) throw new Error(error.message);
        for (const file of data) names.add(file.name);
        if (data.length < PAGE) return names;
    }
}

/**
 * Brings the account's photos in line with a backup: the ones it lacks go up, and the ones no
 * operation has any more (removed in the app, or their operation deleted) are deleted. A backup
 * always carries every photo the app has, so one taken out here comes back with any backup that
 * still has it.
 */
export async function savePhotos(userId: string, photos: BackupPhoto[]): Promise<void> {
    const store = supabase.storage.from(BUCKET);
    const stored = await storedNames(userId);
    for (const p of photos) {
        if (stored.has(p.name)) continue;
        const { error } = await store.upload(`${userId}/${p.name}`, held.get(p.name) ?? new Blob([p.data as Uint8Array<ArrayBuffer>], { type: p.type }), {
            contentType: p.type,
            cacheControl: '31536000', // a name is its content, so a stored photo never changes
            upsert: false,
        });
        // Saved by another device meanwhile: the same picture, since the name is its content.
        if (error && !/already exists/i.test(error.message)) throw new Error(error.message);
    }
    const kept = new Set(photos.map(p => p.name));
    const gone = [...stored].filter(name => PHOTO_NAME.test(name) && !kept.has(name));
    if (gone.length) {
        const { error } = await store.remove(gone.map(name => `${userId}/${name}`));
        if (error) throw new Error(error.message);
    }
}

// Photos on their way from the account, so one asked for twice (opened while the one before
// fetched it ahead) comes down once.
const coming = new Map<string, Promise<Blob>>();

/** One of an operation's photos, from this page's memory or else from the account. */
export function loadPhoto(name: string): Promise<Blob> {
    const known = held.get(name);
    if (known) return Promise.resolve(known);
    let photo = coming.get(name);
    if (!photo) {
        photo = fetchPhoto(name).finally(() => coming.delete(name));
        coming.set(name, photo);
    }
    return photo;
}

async function fetchPhoto(name: string): Promise<Blob> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Sign in to see the photos.');
    const { data, error } = await supabase.storage.from(BUCKET).download(`${session.user.id}/${name}`);
    if (error) {
        throw new Error(/not.?found/i.test(error.message)
            ? "This photo isn't in your account. Import a fresh backup while signed in to bring it."
            : `Couldn't load the photo: ${error.message}`);
    }
    held.set(name, data);
    return data;
}
