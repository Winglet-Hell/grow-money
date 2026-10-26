import { createElement, type ReactElement } from 'react';
import { Font, pdf, type DocumentProps } from '@react-pdf/renderer';
import { TripReportDocument } from '../components/TripReportDocument';
import { canDrawEmoji, emojiOfCode, emojiPicture } from './pdfPictures';
import type { ReportParts, TripReport } from './tripReport';

// The trip report as a PDF file. react-pdf draws it in the browser; the trip page loads this
// module only when a report is made, since the library and its fonts outweigh the rest of the
// trip pages.

// Inter, the app's own font: Google's static cuts, slimmed with fontTools' pyftsubset to Latin
// (Vietnamese included), Cyrillic, punctuation and the money signs, without hinting.
const FONTS = {
    regular: new URL('../assets/fonts/Inter-Regular.ttf', import.meta.url).href,
    semiBold: new URL('../assets/fonts/Inter-SemiBold.ttf', import.meta.url).href,
    bold: new URL('../assets/fonts/Inter-Bold.ttf', import.meta.url).href,
};

let prepared = false;
function prepare(fonts: typeof FONTS) {
    if (prepared) return;
    prepared = true;
    Font.register({
        family: 'Inter',
        fonts: [
            { src: fonts.regular, fontWeight: 400 },
            { src: fonts.semiBold, fontWeight: 600 },
            { src: fonts.bold, fontWeight: 700 },
        ],
    });
    // Words wrap whole: a hyphen inside "Accommo-dation" or a wallet's name reads as a typo.
    Font.registerHyphenationCallback(word => [word]);
    if (canDrawEmoji) Font.registerEmojiSource({ builder: code => emojiPicture(emojiOfCode(code)), withVariationSelectors: true });
}

/** The report as a PDF file's contents. `fonts` is for running outside the browser, where the bundled files have paths. */
export async function renderTripReportPdf(report: TripReport, parts: ReportParts, fonts = FONTS): Promise<Blob> {
    prepare(fonts);
    // The component renders a <Document>, which is what pdf() takes.
    return pdf(createElement(TripReportDocument, { report, parts }) as ReactElement<DocumentProps>).toBlob();
}
