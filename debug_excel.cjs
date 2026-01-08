const XLSX = require('xlsx');
const filename = '/Users/roma/Developer/grow-money/2026_01_05_23_32_54_613742.xlsx';
const workbook = XLSX.readFile(filename);

workbook.SheetNames.forEach(sheetName => {
    console.log(`\n--- Sheet: ${sheetName} ---`);
    const sheet = workbook.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    if (json.length > 0) {
        console.log('Row 0 (Headers):', json[0]);
        // Find row with "Дата" to be sure
        const headerRow = json.find(row => row.some(cell => String(cell).includes('Дата')));
        if (headerRow) {
            console.log('Detected Header Row:', headerRow);
        }
        console.log('Row 1 (Data):', json[1]);
    }
});
