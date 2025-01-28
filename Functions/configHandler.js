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

let isUpdating = false;
let updateQueue = [];

async function updateContactsFile(rows) {
  return new Promise((resolve, reject) => {
    // Add the current request to the queue
    updateQueue.push({ rows, resolve, reject });
    // Try to process the queue
    processQueue();
  });

  function processQueue() {
    if (isUpdating || updateQueue.length === 0) return; // If already updating or queue is empty, do nothing

    isUpdating = true;
    const { rows, resolve, reject } = updateQueue.shift(); // Get the first item from the queue

    readCSV(config.contactsFilePath)
      .then((existingRows) => {
        const updatedRows = existingRows.map((existingRow) => {
          const updatedRow = rows.find(
            (row) =>
              row.ModifiedPhoneNumber === existingRow.ModifiedPhoneNumber &&
              row["First Name"] === existingRow["First Name"] &&
              row["Middle Name"] === existingRow["Middle Name"] &&
              row["Last Name"] === existingRow["Last Name"]
          );
          // If there's a match, update with new data, otherwise keep the existing data
          return updatedRow ? { ...existingRow, ...updatedRow } : existingRow;
        });

        // Combine updated and new rows
        return replaceDataInContactsFile([...updatedRows]);
      })
      .then(() => {
        isUpdating = false; // Reset the flag to allow new updates
        resolve(); // Resolve the promise for the current update
        processQueue(); // Process the next item in the queue if there is one
      })
      .catch((error) => {
        isUpdating = false; // Ensure flag is reset even on error
        reject(error); // Reject the promise with the error
        processQueue(); // Try to process the next item even if this one failed
      });
  }
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
