function createCounter() {
  let counter = 0; // Counter variable
  let queue = []; // Queue to manage parallel calls
  let processing = false; // Flag to indicate if processing is ongoing

  // Function to handle the increment logic
  async function processQueue() {
    if (processing) return; // Skip if already processing
    processing = true; // Set processing flag

    while (queue.length > 0) {
      const resolve = queue.shift(); // Dequeue the next call
      counter++; // Increment the counter
      console.log(`Sent ${counter} messages.`); // Log the counter value
      resolve(); // Resolve the promise
      await new Promise((r) => setTimeout(r, 100)); // Simulate delay (optional)
    }

    processing = false; // Reset the processing flag
  }

  // Function to increment the counter
  return async function increment() {
    return new Promise((resolve) => {
      queue.push(resolve); // Add the call to the queue
      processQueue(); // Trigger queue processing
    });
  };
}

// Export the function in CommonJS
module.exports = {
  createCounter,
};
