const readline = require("readline");

const {
  initializeClients,
} = require("./Functions/clientManager");
const { selectOption, sendMessages } = require("./Functions/messageHandler");
const config = require("./config");
const { parseCSVAndProcessContacts } = require("./Functions/configHandler");

// Main execution flow
async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    // Parse and process contacts from CSV
    const contacts = await parseCSVAndProcessContacts();

    // Initialize clients
    const clients = await initializeClients();

    // Filter contacts based on user input for organization and number of contacts
    const filteredContacts = await filterContacts(rl, contacts);

    // Split contacts into chunks
    const contactChunks = chunkContacts(filteredContacts, config.CHUNK_SIZE);

    // Let the user select the type of message
    const { messageObj } = await selectOption(rl, clients);

    // Assign tasks to clients
    await assignTasksParallel(clients, contactChunks, messageObj);

    // Start periodic memory cleanup
    setInterval(() => cleanupMemory(clients), config.MEMORY_CLEANUP_INTERVAL);
  } catch (error) {
    console.error("An error occurred:", error);
  } finally {
    rl.close();
  }
}

// Helper function to filter contacts based on user input
async function filterContacts(rl, contacts) {
  return new Promise((resolve) => {
    rl.question(
      "Enter the organization name to filter contacts (leave empty to skip): ",
      (organizationName) => {
        // First, filter contacts based on organization name
        const organizationFiltered = contacts.filter((row) => {
          const isPhoneValid =
            row.ModifiedPhoneNumber !== "Invalid phone number";
          const isMessageNotSent = row.Status === "Not Sent";
          const isOrganizationMatch =
            !organizationName || row["Organization Name"] === organizationName;
          return isPhoneValid && isOrganizationMatch && isMessageNotSent;
        });

        // Now ask how many of these filtered contacts to process
        rl.question(
          `Filtered ${organizationFiltered.length} contacts. How many do you want to process? `,
          (input) => {
            const numberToProcess = parseInt(input, 10);
            if (isNaN(numberToProcess) || numberToProcess <= 0) {
              console.error("Invalid input. Please enter a positive integer.");
              rl.close();
              resolve([]);
              return;
            }

            // Filter again to only include those not sent and limit by the number to process
            const filtered = organizationFiltered
              .filter((row) => row.Status === "Not Sent")
              .slice(0, numberToProcess);

            console.log(`Sending message to ${filtered.length}`);

            resolve(filtered);
          }
        );
      }
    );
  });
}

// Helper function to chunk contacts
function chunkContacts(contacts, chunkSize) {
  const chunks = [];
  for (let i = 0; i < contacts.length; i += chunkSize) {
    chunks.push(contacts.slice(i, i + chunkSize));
  }
  console.log(`Total Chunks ${chunks.length}`);
  return chunks;
}

// Helper function to assign tasks to clients in parallel
async function assignTasksParallel(clients, contactChunks) {
  let pendingChunks = [...contactChunks];

  const processNextChunk = (clientId) => {
    if (pendingChunks.length === 0) {
      console.log(`Client ${clientId}: No more tasks to assign.`);
      return;
    }

    const chunk = pendingChunks.shift();
    const clientObj = clients.find((c) => c.id === clientId);

    if (clientObj) {
      clientObj.busy = true;
      console.log(
        `Assigning a new chunk to client ${clientId}. Remaining chunks: ${pendingChunks.length}`
      );

      sendMessages(clientObj, chunk, clientId, () => {
        clientObj.busy = false;
        processNextChunk(clientId);
      });
    }
  };

  clients.forEach((client) => processNextChunk(client.id));
}

// Function to clean up memory
function cleanupMemory(clients) {
  clients.forEach(async ({ client, id }) => {
    if (!client.puppeteer) return;

    const browser = await client.puppeteer.getBrowser();
    const pages = await browser.pages();

    for (const page of pages) {
      await page.evaluate(() => {
        sessionStorage.clear();
        localStorage.clear();
      });
    }

    // Clear cookies and cache
    const clientCookies = await browser.defaultBrowserContext().cookies();
    for (const cookie of clientCookies) {
      await browser.defaultBrowserContext().clearPermissionOverrides(cookie);
    }

    console.log(`Client ${id}: Memory cleanup completed.`);
  });
}

main();
