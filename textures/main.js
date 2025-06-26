// --- Block Rotation Detector WebApp (Steps 1-3, no AI yet) ---
// Uses OpenCV.js for all image processing

let inputCanvas, outputCanvas, inputCtx, outputCtx;
let imgElement = null;
let srcMat = null;
let warpedMat = null;
let points = [];
let dragging = false;
let dragPointIndex = -1;
let lastSelectedPoint = -1;
let pointRadius = 10;
let pointSize = 8;
let lineThickness = 2;
let pointMoveStep = 5;
let gridSquares = [];
let squareSize = 0;
let squareDst = null;
let cleanWarpedCanvas = null; // For storing the warped image before grid lines

// --- TensorFlow.js Model Integration ---
let tfModel = null;
let classNames = ['0', '1', '2', '3']; // Update if your model uses different class names
async function loadModel() {
    tfModel = await tf.loadLayersModel('model/model.json');
    console.log('Model loaded!');
}
loadModel();

// Magnified view variables
let magnifiedCanvas, magnifiedCtx;
let magnifiedView;

function appInit() {
    inputCanvas = document.getElementById('inputCanvas');
    outputCanvas = document.getElementById('outputCanvas');
    inputCtx = inputCanvas.getContext('2d');
    outputCtx = outputCanvas.getContext('2d');

    // Initialize magnified view
    magnifiedCanvas = document.getElementById('magnifiedCanvas');
    magnifiedCtx = magnifiedCanvas.getContext('2d');
    magnifiedView = document.getElementById('magnifiedView');
    magnifiedCanvas.width = 180;
    magnifiedCanvas.height = 120;

    document.getElementById('imageUpload').addEventListener('change', handleImageUpload);
    document.getElementById('generateBtn').addEventListener('click', handleGenerate);
    document.addEventListener('keydown', handleKeyDown);
    inputCanvas.addEventListener('mousedown', handleMouseDown);
    inputCanvas.addEventListener('mousemove', handleMouseMove);
    inputCanvas.addEventListener('mouseup', handleMouseUp);
    inputCanvas.addEventListener('mouseleave', handleMouseUp);
    
    // Add mouse move handler for magnified view updates
    inputCanvas.addEventListener('mousemove', handleInputMouseMove);
    
    // Load saved image and points on startup
    loadSavedImage();
}

function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) {
        imgElement = new window.Image();
        imgElement.onload = function() {
            setupImage();
            // Save image to localStorage
            localStorage.setItem('blockDetector_image', ev.target.result);
        };
        imgElement.src = ev.target.result;
    };
    reader.readAsDataURL(file);
}

function setupImage() {
    // Set canvas size to image size
    inputCanvas.width = imgElement.width;
    inputCanvas.height = imgElement.height;
    outputCanvas.width = imgElement.width + 100;
    outputCanvas.height = imgElement.height + 100;

    // Create OpenCV Mat from image
    if (srcMat) srcMat.delete();
    srcMat = cv.imread(imgElement);

    // Load saved points or use defaults
    let savedPoints = localStorage.getItem('blockDetector_points');
    if (savedPoints) {
        try {
            points = JSON.parse(savedPoints);
            console.log('Loaded saved points:', points);
            console.log('Image dimensions:', imgElement.width, 'x', imgElement.height);
            
            // Validate points are within image bounds
            let validPoints = true;
            for (let point of points) {
                if (point[0] < 0 || point[0] > imgElement.width || 
                    point[1] < 0 || point[1] > imgElement.height) {
                    console.log('Point out of bounds:', point, 'Image size:', imgElement.width, 'x', imgElement.height);
                    validPoints = false;
                    break;
                }
            }
            if (!validPoints || points.length !== 4) {
                console.log('Using default points due to validation failure');
                points = getDefaultPoints();
            } else {
                console.log('Successfully loaded saved points');
            }
        } catch (e) {
            console.log('Error loading saved points, using defaults:', e);
            points = getDefaultPoints();
        }
    } else {
        console.log('No saved points found, using defaults');
        points = getDefaultPoints();
    }
    
    lastSelectedPoint = 0;
    dragging = false;
    dragPointIndex = -1;
    drawInput();
    applyPerspectiveTransform();
    
    // Show magnified view when image is loaded
    magnifiedView.style.display = 'flex';
    // Initialize with center of image
    updateMagnifiedView(imgElement.width / 2, imgElement.height / 2);
}

function getDefaultPoints() {
    return [
        [30, 30],
        [imgElement.width - 30, 30],
        [imgElement.width - 30, imgElement.height - 30],
        [30, imgElement.height - 30]
    ];
}

function savePoints() {
    if (points.length === 4) {
        localStorage.setItem('blockDetector_points', JSON.stringify(points));
    }
}

function drawInput() {
    // Draw image
    inputCtx.clearRect(0, 0, inputCanvas.width, inputCanvas.height);
    inputCtx.drawImage(imgElement, 0, 0);
    // Draw lines
    inputCtx.strokeStyle = 'lime';
    inputCtx.lineWidth = lineThickness;
    inputCtx.beginPath();
    for (let i = 0; i < points.length; ++i) {
        let p1 = points[i];
        let p2 = points[(i + 1) % points.length];
        if (i < points.length - 1) {
            inputCtx.moveTo(p1[0], p1[1]);
            inputCtx.lineTo(p2[0], p2[1]);
        }
    }
    if (points.length === 4) {
        inputCtx.moveTo(points[3][0], points[3][1]);
        inputCtx.lineTo(points[0][0], points[0][1]);
    }
    inputCtx.stroke();
    // Draw points
    for (let i = 0; i < points.length; ++i) {
        let [x, y] = points[i];
        inputCtx.beginPath();
        inputCtx.arc(x, y, pointSize + (i === lastSelectedPoint ? 2 : 0), 0, 2 * Math.PI);
        inputCtx.fillStyle = i === lastSelectedPoint ? 'red' : 'lime';
        inputCtx.fill();
        inputCtx.font = '14px Arial';
        inputCtx.fillStyle = 'white';
        inputCtx.fillText((i + 1).toString(), x + 8, y + 8);
        if (i === lastSelectedPoint) {
            inputCtx.fillText('*', x - 14, y - 10);
        }
    }
    // Save points after drawing
    
    // Update magnified view to focus on selected point
    if (lastSelectedPoint >= 0 && lastSelectedPoint < points.length) {
        let [x, y] = points[lastSelectedPoint];
        updateMagnifiedView(x, y);
    }
    
    savePoints();
}

function handleMouseDown(e) {
    if (!imgElement) return;
    const rect = inputCanvas.getBoundingClientRect();
    const scaleX = inputCanvas.width / rect.width;
    const scaleY = inputCanvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    // Debug: draw a crosshair at the click location
    drawInput();
    inputCtx.save();
    inputCtx.strokeStyle = 'magenta';
    inputCtx.lineWidth = 2;
    inputCtx.beginPath();
    inputCtx.moveTo(x - 8, y); inputCtx.lineTo(x + 8, y);
    inputCtx.moveTo(x, y - 8); inputCtx.lineTo(x, y + 8);
    inputCtx.stroke();
    inputCtx.beginPath();
    inputCtx.arc(x, y, 4, 0, 2 * Math.PI);
    inputCtx.stroke();
    inputCtx.restore();
    // Check if clicking on a point (use larger, more precise hitbox)
    for (let i = 0; i < points.length; ++i) {
        let [px, py] = points[i];
        if (Math.hypot(x - px, y - py) <= pointSize + 2) { // match drawn point size
            lastSelectedPoint = i;
            drawInput();
            dragging = true;
            dragPointIndex = i;
            return;
        }
    }
    // Add new point if less than 4
    if (points.length < 4) {
        points.push([x, y]);
        lastSelectedPoint = points.length - 1;
        drawInput();
        if (points.length === 4) {
            applyPerspectiveTransform();
        }
    }
}

function handleMouseMove(e) {
    if (!imgElement || !dragging || dragPointIndex === -1) return;
    const rect = inputCanvas.getBoundingClientRect();
    const scaleX = inputCanvas.width / rect.width;
    const scaleY = inputCanvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    points[dragPointIndex] = [x, y];
    drawInput();
    // Do NOT update perspective transform here (wait for mouse up)
}

function handleMouseUp(e) {
    dragging = false;
    if (dragPointIndex !== -1) lastSelectedPoint = dragPointIndex;
    // Only update perspective transform after drag is finished
    if (points.length === 4) {
        applyPerspectiveTransform();
    }
    dragPointIndex = -1;
}

function handleKeyDown(e) {
    if (!imgElement || lastSelectedPoint === -1) return;
    let [x, y] = points[lastSelectedPoint];
    let changed = false;
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') { y -= pointMoveStep; changed = true; }
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') { y += pointMoveStep; changed = true; }
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { x -= pointMoveStep; changed = true; }
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { x += pointMoveStep; changed = true; }
    if (e.key >= '1' && e.key <= '4') {
        let idx = parseInt(e.key) - 1;
        if (idx < points.length) {
            lastSelectedPoint = idx;
            drawInput();
            // Update magnified view to focus on newly selected point
            let [newX, newY] = points[lastSelectedPoint];
            updateMagnifiedView(newX, newY);
        }
        return;
    }
    if (e.key === '+' || e.key === '=') { pointMoveStep = Math.min(10, pointMoveStep + 1); return; }
    if (e.key === '-') { pointMoveStep = Math.max(1, pointMoveStep - 1); return; }
    if (e.key === 'r' || e.key === 'R') { resetPoints(); return; }
    if (changed) {
        points[lastSelectedPoint] = [x, y];
        drawInput();
        if (points.length === 4) {
            applyPerspectiveTransform();
        }
    }
}

function resetPoints() {
    if (!imgElement) return;
    points = getDefaultPoints();
    lastSelectedPoint = 0;
    drawInput();
    applyPerspectiveTransform();
}

function loadSavedImage() {
    const savedImage = localStorage.getItem('blockDetector_image');
    if (savedImage) {
        imgElement = new window.Image();
        imgElement.onload = function() {
            setupImage();
        };
        imgElement.src = savedImage;
    }
}

function applyPerspectiveTransform() {
    if (!imgElement || points.length !== 4) {
        outputCtx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
        cleanWarpedCanvas = null;
        return;
    }
    // Calculate center and average side
    let cx = (points[0][0] + points[1][0] + points[2][0] + points[3][0]) / 4;
    let cy = (points[0][1] + points[1][1] + points[2][1] + points[3][1]) / 4;
    let sideLengths = [
        Math.hypot(points[1][0] - points[0][0], points[1][1] - points[0][1]),
        Math.hypot(points[2][0] - points[1][0], points[2][1] - points[1][1]),
        Math.hypot(points[3][0] - points[2][0], points[3][1] - points[2][1]),
        Math.hypot(points[0][0] - points[3][0], points[0][1] - points[3][1])
    ];
    let avgSide = sideLengths.reduce((a, b) => a + b, 0) / 4;
    let halfSide = avgSide / 2;
    let padding = 50;
    let dst = [
        [cx + padding - halfSide, cy + padding - halfSide],
        [cx + padding + halfSide, cy + padding - halfSide],
        [cx + padding + halfSide, cy + padding + halfSide],
        [cx + padding - halfSide, cy + padding + halfSide]
    ];
    squareDst = dst;
    // Perspective transform
    let srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, points.flat());
    let dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, dst.flat());
    let dsize = new cv.Size(imgElement.width + 2 * padding, imgElement.height + 2 * padding);
    if (warpedMat) warpedMat.delete();
    warpedMat = new cv.Mat();
    let M = cv.getPerspectiveTransform(srcTri, dstTri);
    cv.warpPerspective(srcMat, warpedMat, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());
    srcTri.delete(); dstTri.delete(); M.delete();
    // Draw to output canvas
    cv.imshow(outputCanvas, warpedMat);
    // Save a clean copy of the warped image before drawing grid
    cleanWarpedCanvas = document.createElement('canvas');
    cleanWarpedCanvas.width = outputCanvas.width;
    cleanWarpedCanvas.height = outputCanvas.height;
    let cleanCtx = cleanWarpedCanvas.getContext('2d');
    cleanCtx.drawImage(outputCanvas, 0, 0);
    // Draw grid overlay
    drawGridOverlay();
}

// Add event listener for output canvas clicks
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
        const outCanvas = document.getElementById('outputCanvas');
        if (outCanvas) {
            outCanvas.addEventListener('mousedown', handleOutputCanvasClick);
        }
    });
}

let squareTexts = {}; // {squareIndex: text}

function preprocessCanvasForModel(canvas) {
    // Resize to 64x64
    let temp = document.createElement('canvas');
    temp.width = 64;
    temp.height = 64;
    let ctx = temp.getContext('2d');
    ctx.drawImage(canvas, 0, 0, 64, 64);
    // Get image data and convert to grayscale
    let imgData = ctx.getImageData(0, 0, 64, 64);
    let data = imgData.data;
    let gray = [];
    for (let i = 0; i < data.length; i += 4) {
        // Grayscale: 0.299*R + 0.587*G + 0.114*B
        let v = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
        gray.push(v); // Keep raw pixel values [0,255] - let model's Rescaling layer handle normalization
    }
    // Convert to tensor: [1, 64, 64, 1]
    let tensor = tf.tensor(gray, [64, 64, 1]).expandDims(0);
    return tensor;
}

// --- Async runOnSquare for AI prediction ---
async function runOnSquare(croppedCanvas, info) {
    if (!tfModel) return 'Loading...';
    
    console.log(`=== Debug: Processing square (${info.i}, ${info.j}) ===`);
    
    let inputTensor = preprocessCanvasForModel(croppedCanvas);
    
    let prediction = tfModel.predict(inputTensor);
    let data = await prediction.data();
    console.log('Raw prediction data:', Array.from(data));
    
    let predictedClass = data.indexOf(Math.max(...data));
    let confidence = Math.max(...data);
    
    console.log('Class probabilities:');
    for (let i = 0; i < data.length; i++) {
        console.log(`  Class ${classNames[i]}: ${(data[i] * 100).toFixed(2)}%`);
    }
    console.log(`Predicted class: ${classNames[predictedClass]} (index: ${predictedClass})`);
    console.log(`Confidence: ${(confidence * 100).toFixed(2)}%`);
    console.log('=== End Debug ===');
    
    inputTensor.dispose();
    prediction.dispose();
    return `${classNames[predictedClass]} (${(confidence*100).toFixed(1)}%)`;
}

// --- Update click handler to support async ---
async function handleOutputCanvasClick(e) {
    // Only respond to left mouse button (button 0)
    if (e.button !== 0) return;
    
    if (!cleanWarpedCanvas || !squareDst) return;
    const rect = outputCanvas.getBoundingClientRect();
    const scaleX = outputCanvas.width / rect.width;
    const scaleY = outputCanvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    // Find which grid square was clicked
    let squarePoints = squareDst.map(pt => [Math.round(pt[0]), Math.round(pt[1])]);
    let avgSide = Math.hypot(squarePoints[1][0] - squarePoints[0][0], squarePoints[1][1] - squarePoints[0][1]);
    let sSize = Math.round(avgSide);
    let gridOriginX = squarePoints[0][0];
    let gridOriginY = squarePoints[0][1];
    let i = Math.floor((x - gridOriginX) / sSize);
    let j = Math.floor((y - gridOriginY) / sSize);
    let tlx = gridOriginX + i * sSize;
    let tly = gridOriginY + j * sSize;
    let brx = tlx + sSize;
    let bry = tly + sSize;
    if (tlx < 0 || tly < 0 || brx > outputCanvas.width || bry > outputCanvas.height) return;
    let cropCanvas = document.createElement('canvas');
    cropCanvas.width = sSize;
    cropCanvas.height = sSize;
    let cropCtx = cropCanvas.getContext('2d');
    cropCtx.drawImage(cleanWarpedCanvas, tlx, tly, sSize, sSize, 0, 0, sSize, sSize);
    // Show loading text immediately (even if square was already detected)
    let squareKey = `${i},${j}`;
    squareTexts[squareKey] = '...';
    drawGridOverlay();
    // Run AI prediction (always run, even for previously detected squares)
    let resultText = await runOnSquare(cropCanvas, {i, j, x, y});
    squareTexts[squareKey] = resultText;
    drawGridOverlay();
    
    // Redraw input canvas to refresh the display
    drawInput();
}

function drawGridOverlay() {
    if (!warpedMat) return;
    // Calculate grid based on main square
    let ctx = outputCtx;
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'lime';
    let squarePoints = squareDst.map(pt => [Math.round(pt[0]), Math.round(pt[1])]);
    let avgSide = Math.hypot(squarePoints[1][0] - squarePoints[0][0], squarePoints[1][1] - squarePoints[0][1]);
    squareSize = Math.round(avgSide);
    let w = outputCanvas.width, h = outputCanvas.height;
    // Horizontal lines
    for (let y = squarePoints[0][1]; y < h; y += squareSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    for (let y = squarePoints[0][1]; y > 0; y -= squareSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    // Vertical lines
    for (let x = squarePoints[0][0]; x > 0; x -= squareSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let x = squarePoints[1][0]; x < w; x += squareSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    // Draw main square
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 4; ++i) {
        let p1 = squarePoints[i];
        let p2 = squarePoints[(i + 1) % 4];
        ctx.moveTo(p1[0], p1[1]);
        ctx.lineTo(p2[0], p2[1]);
    }
    ctx.stroke();
    // Draw text on selected squares
    for (let key in squareTexts) {
        let [i, j] = key.split(',').map(Number);
        let tlx = squarePoints[0][0] + i * squareSize;
        let tly = squarePoints[0][1] + j * squareSize;
        let centerX = tlx + squareSize / 2;
        let centerY = tly + squareSize / 2;
        
        // Draw detection info
        ctx.font = '18px Arial';
        ctx.fillStyle = 'yellow';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(squareTexts[key], centerX, centerY - 10);
        
        // Draw grid position underneath
        ctx.font = '14px Arial';
        ctx.fillStyle = 'cyan';
        ctx.fillText(`(${i},${j})`, centerX, centerY + 10);
    }
    ctx.restore();
}

function showMagnifiedView(x, y) {
    if (!imgElement) return;
    
    magnifiedView.style.display = 'flex';
    updateMagnifiedView(x, y);
}

function hideMagnifiedView() {
    magnifiedView.style.display = 'none';
}

function updateMagnifiedView(x, y) {
    if (!imgElement || !magnifiedCanvas) return;
    
    const zoom = 4; // 4x magnification
    const size = 45; // Size of the area to capture (45px * 4 = 180px canvas width)
    
    // Calculate the area to capture from the input canvas
    const sourceX = Math.max(0, Math.min(x - size/2, inputCanvas.width - size));
    const sourceY = Math.max(0, Math.min(y - size/2, inputCanvas.height - size));
    
    // Create a temporary canvas with just the image (no lines/points)
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = inputCanvas.width;
    tempCanvas.height = inputCanvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    
    // Draw just the image without any overlay
    tempCtx.drawImage(imgElement, 0, 0);
    
    // Clear the magnified canvas
    magnifiedCtx.clearRect(0, 0, magnifiedCanvas.width, magnifiedCanvas.height);
    
    // Draw the magnified portion from the clean image
    magnifiedCtx.drawImage(
        tempCanvas, 
        sourceX, sourceY, size, size,
        0, 0, magnifiedCanvas.width, magnifiedCanvas.height
    );
    
    // Draw a crosshair at the center
    magnifiedCtx.strokeStyle = 'red';
    magnifiedCtx.lineWidth = 2;
    magnifiedCtx.beginPath();
    magnifiedCtx.moveTo(magnifiedCanvas.width/2 - 10, magnifiedCanvas.height/2);
    magnifiedCtx.lineTo(magnifiedCanvas.width/2 + 10, magnifiedCanvas.height/2);
    magnifiedCtx.moveTo(magnifiedCanvas.width/2, magnifiedCanvas.height/2 - 10);
    magnifiedCtx.lineTo(magnifiedCanvas.width/2, magnifiedCanvas.height/2 + 10);
    magnifiedCtx.stroke();
    
    // Update coordinates display
    document.getElementById('magnifiedCoords').textContent = `X: ${Math.round(x)}, Y: ${Math.round(y)}`;
}

function handleInputMouseMove(e) {
    if (!imgElement) return;
    
    // Only update magnified view if no point is selected or if we're dragging
    if (lastSelectedPoint === -1 || dragging) {
        const rect = inputCanvas.getBoundingClientRect();
        const scaleX = inputCanvas.width / rect.width;
        const scaleY = inputCanvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        
        // Update magnified view with mouse position
        updateMagnifiedView(x, y);
    }
}
