import fs from "fs";
import path from "path";

const parseCsv = (text: string) => {
  const result: string[][] = [];
  let row: string[] = [];
  let current = "";
  let inQuotes = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped double quote: "" -> "
        current += '"';
        i++; // skip next quote
      } else {
        // Toggle quote status
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(current.trim());
      current = "";
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++; // skip \n
      }
      row.push(current.trim());
      result.push(row);
      row = [];
      current = "";
    } else {
      current += char;
    }
  }
  
  if (row.length > 0 || current.length > 0) {
    row.push(current.trim());
    result.push(row);
  }
  
  return result;
};

function main() {
  const csvPath = "/Users/abvicky/Projects/WAL04/orders_export.csv";
  if (!fs.existsSync(csvPath)) {
    console.error("CSV file not found!");
    return;
  }

  const csvText = fs.readFileSync(csvPath, "utf-8");
  console.log(`Reading CSV text length: ${csvText.length} bytes`);

  try {
    const rows = parseCsv(csvText);
    console.log(`✅ Parsed success! Total rows: ${rows.length}`);
    
    if (rows.length > 0) {
      console.log("Headers:", rows[0]);
      console.log(`First data row columns count: ${rows[1]?.length}`);
      console.log("First Order Name:", rows[1]?.[0]);
      console.log("First Order Email:", rows[1]?.[1]);
      console.log("First Order Total:", rows[1]?.[11]);
      console.log("First Order Payment:", rows[1]?.[47]);
      console.log("First Order Phone:", rows[1]?.[70]);
    }
  } catch (err: any) {
    console.error("Parsing failed with error:", err.message);
  }
}

main();
