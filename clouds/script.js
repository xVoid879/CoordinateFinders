const directionMap = ["north", "west", "south", "east"];
const imagePaths = {
  old: 'image/clouds_old.png',
  new: 'image/clouds.png'
};

let selectedVersion = 'old';
const patternInput = document.getElementById('patternInput');
const resultsDiv = document.getElementById('results');
const canvas = document.getElementById('imageCanvas');
const ctx = canvas.getContext('2d');

document.querySelectorAll('.image-select button').forEach(button => {
  button.onclick = () => {
    selectedVersion = button.dataset.version;
    resultsDiv.textContent = `Selected version: ${selectedVersion}`;
  };
});

function rotate90Matrix(m) {
  let m2 = [];
  for (let j = 0; j < m[0].length; j++) {
    m2.push([]);
    for (let i = m.length - 1; i >= 0; i--) {
      m2[j].push(m[i][j]);
    }
  }
  return m2;
}

function matricesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].length !== b[i].length) return false;
    for (let j = 0; j < a[i].length; j++) {
      if (a[i][j] !== b[i][j]) return false;
    }
  }
  return true;
}

function determineDirection(inputMatrix, outputMatrix) {
  let currentMatrix = inputMatrix;
  for (let i = 0; i < 4; i++) {
    if (matricesEqual(currentMatrix, outputMatrix)) {
      return { direction: directionMap[i], rotationIndex: i };
    }
    currentMatrix = rotate90Matrix(currentMatrix);
  }
  return null;
}

function parsePattern(text) {
  return text.trim().split('\n').map(line => line.trim().split(''));
}

function getValidCoords(spawnRange, pixelZ, fast) {
  const coords = [];
  const blocks = fast ? 8 : 12;
  const gridSize = blocks * 256;
  const intQuotient = Math.floor(spawnRange / gridSize);
  const zOffset = pixelZ * blocks;

  let min_i = -intQuotient - 1;
  if ((gridSize * min_i) - 4 + zOffset < -spawnRange) min_i += 1;

  let max_i = intQuotient;
  if ((gridSize * max_i) - 4 + zOffset > spawnRange) max_i -= 1;

  for (let i = min_i; i <= max_i; i++) {
    coords.push((gridSize * i) - 4 + zOffset);
  }

  return coords;
}

async function loadPatternTxt(version) {
  const txtPath = version === "old" ? "image/old.txt" : "image/new.txt";
  const response = await fetch(txtPath);
  if (!response.ok) throw new Error(`Failed to load ${txtPath}`);
  const text = await response.text();
  return text.trim().split("\n").map(line => line.trim().split(""));
}

async function findCloudPattern(imageSrc, pattern) {
  const version = imageSrc.includes("old") ? "old" : "new";
  const imageMatrix = await loadPatternTxt(version);

  const height = imageMatrix.length;
  const width = imageMatrix[0].length;

  let patterns = [];
  let matches = [[], [], [], []];

  let currentPattern = pattern;

  for (let o = 0; o < 4; o++) {
    if (o !== 0) currentPattern = rotate90Matrix(currentPattern);
    patterns.push(currentPattern);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let match = true;
        outer: for (let i = 0; i < currentPattern.length; i++) {
          for (let j = 0; j < currentPattern[i].length; j++) {
            let pixel_x = (x + j) % width;
            let pixel_y = (y + i) % height;
            const a = imageMatrix[pixel_y][pixel_x];
            const patternChar = currentPattern[i][j];
            if (patternChar !== '?' && ((a === '1') !== (patternChar === '1'))) {
              match = false;
              break outer;
            }
          }
        }
        if (match) matches[o].push([x, y]);
      }
    }
  }

  return { patterns, matches };
}

async function runFinder(fastMode) {  try {
    let patternText = patternInput.value;
    if (!patternText.trim()) {
      resultsDiv.textContent = 'Please enter a pattern.';
      return;
    }
    if (!/^[01?\n]+$/.test(patternText)) {
      resultsDiv.textContent = 'Please only use 0, 1, ?, and no spaces allowed.';
      return;
    }
    let lines = patternText.trim().split('\n');
    let firstLength = lines[0].length;
    if (!lines.every(len => len.length === firstLength)) {
      resultsDiv.textContent = 'Each line in the pattern must have the same number of characters.';
      return;
    }
    let inputPattern = parsePattern(patternText);
    let { patterns, matches } = await findCloudPattern(imagePaths[selectedVersion], inputPattern);
    let totalMatches = matches.reduce((acc, arr) => acc + arr.length, 0);

    if (totalMatches === 0) {
      resultsDiv.textContent = 'Pattern not found';
      return;
    }
    if (totalMatches >= 150) {
      resultsDiv.textContent = 'Too many matches';
      return;
    }

    let outputText = `Got ${totalMatches} match${totalMatches > 1 ? 'es' : ''}\n\n`;

    for (let i = 0; i < matches.length; i++) {
      for (let match of matches[i]) {
        let directionInfo = determineDirection(inputPattern, patterns[i]);
        let inputDir = directionInfo ? directionInfo.direction : 'unknown';
        outputText += `Input oriented: ${inputDir}, inserted from TOP\n`;
        outputText += `Match at (x=${match[0]}, y=${match[1]}), pattern:\n`;
        outputText += patterns[i].map(row => row.join('')).join('\n') + '\n';
        const validZCoords = getValidCoords(10000, match[1], fastMode);
        outputText += `Estimated Z coordinates (${fastMode ? 'Fast' : 'Fancy'} Cloud, SpawnRange:10000):\n`;
        outputText += validZCoords.join(', ') + '\n\n';
      }
    }

    resultsDiv.textContent = outputText;
  } catch (err) {
    resultsDiv.textContent = 'Error: ' + err;
  }
}

const viewerCanvas = document.getElementById('viewerCanvas');
const viewerCtx = viewerCanvas.getContext('2d');
let viewerImage = new Image();
let drawing = false;

function loadViewer(version) {
  const imageSrc = imagePaths[version];
  viewerImage = new Image();
  viewerImage.crossOrigin = 'anonymous';
  viewerImage.onload = () => {
    viewerCanvas.width = viewerImage.width;
    viewerCanvas.height = viewerImage.height;
    viewerCtx.drawImage(viewerImage, 0, 0);
  };
  viewerImage.src = imageSrc;
}

viewerCanvas.addEventListener('mousemove', (e) => {
  const rect = viewerCanvas.getBoundingClientRect();
  const x = Math.floor(e.clientX - rect.left);
  const y = Math.floor(e.clientY - rect.top);
  document.getElementById('pixelCoords').textContent = `Pixel: (${x}, ${y})`;
  if (drawing) {
    viewerCtx.fillStyle = 'red';
    viewerCtx.fillRect(x - 2, y - 2, 5, 5);
  }
});

viewerCanvas.addEventListener('mousedown', () => drawing = true);
viewerCanvas.addEventListener('mouseup', () => drawing = false);
viewerCanvas.addEventListener('mouseleave', () => drawing = false);

function downloadCanvas() {
  const link = document.createElement('a');
  link.download = 'edited_clouds.png';
  link.href = viewerCanvas.toDataURL();
  link.click();
}

function rotateViewer() {
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d');
  const w = viewerCanvas.width;
  const h = viewerCanvas.height;
  tempCanvas.width = h;
  tempCanvas.height = w;
  tempCtx.translate(h, 0);
  tempCtx.rotate(Math.PI / 2);
  tempCtx.drawImage(viewerCanvas, 0, 0);
  viewerCanvas.width = h;
  viewerCanvas.height = w;
  viewerCtx.clearRect(0, 0, h, w);
  viewerCtx.drawImage(tempCanvas, 0, 0);
}

function highlightPixel() {
  const x = parseInt(document.getElementById('inputX').value);
  const y = parseInt(document.getElementById('inputY').value);

  if (isNaN(x) || isNaN(y)) {
    alert('Please enter valid numeric X and Y coordinates.');
    return;
  }

  viewerCtx.clearRect(0, 0, viewerCanvas.width, viewerCanvas.height);
  viewerCtx.drawImage(viewerImage, 0, 0);

  viewerCtx.beginPath();
  viewerCtx.strokeStyle = 'lime';
  viewerCtx.lineWidth = 2;
  viewerCtx.arc(x, y, 10, 0, 2 * Math.PI);
  viewerCtx.stroke();
}
