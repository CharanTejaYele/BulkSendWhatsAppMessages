const fs = require("fs");
const csv = require("csv-parser");
const path = require("path");
const { parse } = require("csv-parse");
const { formatPhoneNumber } = require("./PhoneNumberModifier");
const { createObjectCsvWriter } = require("csv-writer");
const config = require("../config");

function parseCSVAndProcessContacts() {
  const rows = [];
  return new Promise((resolve, reject) => {
    fs.createReadStream(config.contactsFilePath)
      .pipe(csv())
      .on("data", (row) => rows.push(row))
      .on("end", async () => {
        // Add or update 'Status' and 'ModifiedPhoneNumber'
        rows.forEach((row) => {
          if (!row.Status) row.Status = "Not Sent";
          if (!row.ModifiedPhoneNumber) {
            row.ModifiedPhoneNumber = formatPhoneNumber(row["Phone 1 - Value"]);
          }
        });

        await replaceDataInContactsFile(rows);
        console.log(
          "Contacts file updated with Status and ModifiedPhoneNumber columns."
        );
        resolve(rows);
      })
      .on("error", (err) => reject(err));
  });
}

async function replaceDataInContactsFile(rows) {
  const headers = Object.keys(rows[0]).map((header) => ({
    id: header,
    title: header,
  }));
  const csvWriter = createObjectCsvWriter({
    path: config.contactsFilePath,
    header: headers,
  });
  await csvWriter.writeRecords(rows);
}

async function updateContactsFile(rows) {
  const existingRows = await readCSV(config.contactsFilePath);
  const updatedRows = existingRows.map((existingRow) => {
    const updatedRow = rows.find(
      (row) =>
        row.ModifiedPhoneNumber === existingRow.ModifiedPhoneNumber &&
        row["First Name"] === existingRow["First Name"] &&
        row["Middle Name"] === existingRow["Middle Name"] &&
        row["Last Name"] === existingRow["Last Name"]
    );
    return updatedRow || existingRow;
  });
  await replaceDataInContactsFile(updatedRows);
}

function readCSV(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(parse({ columns: true }))
      .on("data", (data) => results.push(data))
      .on("end", () => resolve(results))
      .on("error", (error) => reject(error));
  });
}

module.exports = {
  parseCSVAndProcessContacts,
  updateContactsFile,
};
