const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const config = require("../config");

function createClient(clientId) {
  return new Promise((resolve) => {
    const client = new Client({
      authStrategy: new LocalAuth({ clientId: `whatsapp-client-${clientId}` }),
      puppeteer: { headless: true },
    });

    client.on("qr", (qr) => {
      qrcode.generate(qr, { small: true });
      console.log(
        `QR code for client ${clientId} generated. Please scan to authenticate.`
      );
    });

    client.on("ready", () => {
      console.log(`Client ${clientId} is ready!`);
      resolve(client);
    });

    client.initialize();
  });
}

async function initializeClients() {
  const clients = [];
  for (let i = 0; i < config.MAX_CLIENTS; i++) {
    const client = await createClient(i + 1);
    clients.push({ client, id: i + 1, busy: false });
  }
  return clients;
}

const restartClient = async (clientObj, clientId, callback) => {
  if (!clientObj) {
    console.error(`Client ${clientId} not found for restart.`);
    return;
  }

  console.log(`Restarting client ${clientId}...`);
  try {
    await clientObj.client.destroy(); // Destroy the client
    const newClient = await createClient(clientId); // Reinitialize the client
    clientObj.client = newClient; // Replace the old client instance
    console.log(`Client ${clientId} restarted successfully.`);
    if (callback) callback(); // Notify that the restart is complete
  } catch (error) {
    console.error(`Failed to restart client ${clientId}:`, error);
    if (callback) callback();
  }
};

module.exports = {
  initializeClients,
  createClient,
  restartClient,
};
