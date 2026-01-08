
const XLSX = require('xlsx');

const FILE_PATH = '/Users/roma/Developer/grow-money/2026_01_05_23_32_54_613742.xlsx';

try {
    const workbook = XLSX.readFile(FILE_PATH);
    const sheetName = workbook.SheetNames[0];
    console.log('Sheet Name:', sheetName);
    const sheet = workbook.Sheets[sheetName];

    // Get headers (first row)
    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    // Print first 5 rows to be sure where headers are
    console.log('--- First 5 rows ---');
    jsonData.slice(0, 5).forEach((row, i) => {
        console.log(`Row ${i}:`, JSON.stringify(row));
    });

} catch (error) {
    console.error('Error reading file:', error);
}
