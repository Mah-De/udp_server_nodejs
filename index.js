const dgram = require('dgram');
const fs = require('fs');
const readline = require('readline');

// UDP server setup
const udpPort = 12345;
const udpServer = dgram.createSocket('udp4');  // Using UDPv4

let recording_index = 0;
let dataSize = 0;  // Track the size of audio data

// WAV header parameters
const sampleRate = 16000;  // 8 kHz sample rate
const numChannels = 2;     // Stereo (2 channels)
const bitsPerSample = 32;  // 32-bit samples
const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
const blockAlign = numChannels * (bitsPerSample / 8);

let wavFilePath = "";
let fileStream = null; // We'll manage this globally

// Write the WAV header to the file
function writeWavHeader(fileStream, dataSize) {
  const riffHeader = Buffer.alloc(44);
  riffHeader.write('RIFF', 0);  // Chunk ID
  riffHeader.writeUInt32LE(36 + dataSize, 4);  // Chunk size (file size - 8)
  riffHeader.write('WAVE', 8);  // Format

  // fmt chunk
  riffHeader.write('fmt ', 12);  // Chunk ID
  riffHeader.writeUInt32LE(16, 16);  // fmt chunk size
  riffHeader.writeUInt16LE(1, 20);  // Audio format (1 = PCM)
  riffHeader.writeUInt16LE(numChannels, 22);  // Number of channels
  riffHeader.writeUInt32LE(sampleRate, 24);  // Sample rate
  riffHeader.writeUInt32LE(byteRate, 28);  // Byte rate
  riffHeader.writeUInt16LE(blockAlign, 32);  // Block align
  riffHeader.writeUInt16LE(bitsPerSample, 34);  // Bits per sample

  // data chunk
  riffHeader.write('data', 36);  // Chunk ID
  riffHeader.writeUInt32LE(dataSize, 40);  // Data chunk size

  fileStream.write(riffHeader);
}

console.clear();

// Variables to track speed and message count
let start_time = Date.now();  // Initialize start_time to track the beginning time
let first_msg_time = 0;  // Used to calculate the average speed after the first message
let number_of_msgs = 0;

// UDP server listens on port 8080 for incoming audio data
udpServer.on('message', (message, remote) => {
  console.log(`Received message from ${remote.address}:${remote.port}`);

  if (dataSize === 0) {
    // Generate the WAV file path and create the write stream
    wavFilePath = "audio_stream_" + sampleRate.toString() + "_" + numChannels.toString() + "_" + bitsPerSample.toString() + "_" + recording_index.toString() + ".wav";
    fileStream = fs.createWriteStream(wavFilePath, { flags: 'w' });

    // Write the WAV header initially
    writeWavHeader(fileStream, dataSize);
  }

  // Append the audio data to the file
  if (Buffer.isBuffer(message)) {
    fileStream.write(message);  // Write raw audio data
    dataSize += message.length; // Update data size

    // Calculate speed in kbps
    const speed = (8 * message.length) / (Date.now() - start_time);  // speed in kbps
    if (first_msg_time === 0) {
      first_msg_time = Date.now();
    }
    const avgSpeed = (8 * dataSize) / (Date.now() - first_msg_time); // average speed in kbps
    console.clear();
    console.log("Moment speed: \t\t%d kbps\nAvg speed: \t\t%d kbps\nAvg msg length: \t%d\nNum msgs: \t\t%d", speed, avgSpeed, dataSize / number_of_msgs, number_of_msgs);

    // Update start_time for the next calculation
    start_time = Date.now();
    number_of_msgs++;
  } else {
    console.log('Received non-binary message');
  }
});

// Listen for 'Enter' key press to end the file
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question("Press Enter to stop recording and finalize the file...\n", () => {
  // Close the UDP server and finalize the WAV file
  udpServer.close(() => {
    console.log('UDP server closed');

    // Only close the file stream when Enter is pressed
    const fileStats = fs.statSync(wavFilePath);
    const finalFileSize = fileStats.size;
    const finalDataSize = finalFileSize - 44;  // Exclude header size

    // Update the WAV header with the correct data size and file size
    const updatedHeader = Buffer.alloc(44);
    updatedHeader.write('RIFF', 0);
    updatedHeader.writeUInt32LE(36 + finalDataSize, 4);  // Update total file size
    updatedHeader.write('WAVE', 8);
    updatedHeader.write('fmt ', 12);
    updatedHeader.writeUInt32LE(16, 16);
    updatedHeader.writeUInt16LE(1, 20);
    updatedHeader.writeUInt16LE(numChannels, 22);
    updatedHeader.writeUInt32LE(sampleRate, 24);
    updatedHeader.writeUInt32LE(byteRate, 28);
    updatedHeader.writeUInt16LE(blockAlign, 32);
    updatedHeader.writeUInt16LE(bitsPerSample, 34);
    updatedHeader.write('data', 36);
    updatedHeader.writeUInt32LE(finalDataSize, 40);  // Update data chunk size

    const fd = fs.openSync(wavFilePath, 'r+');
    fs.writeSync(fd, updatedHeader, 0, 44, 0);  // Write updated header at the start
    fs.closeSync(fd);

    recording_index++;
    console.log('WAV file updated with final header and data size');
    rl.close();  // Close the readline interface
  });
});

// Start the UDP server to listen on the specified port
udpServer.bind(udpPort);
console.log('UDP server running on udp://localhost:' + udpPort);