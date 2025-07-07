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
let lowConfidenceSquares = {}; // Track squares with confidence below 70%

async function loadModel() {
    try {
        // Adjust the model path if it's not directly in the root
        tfModel = await tf.loadLayersModel('model/model.json');
        console.log('Model loaded!');
    } catch (error) {
        console.error('Failed to load TensorFlow.js model:', error);
        // Optionally display a message to the user that the model failed to load
        // Using a custom modal/message box instead of alert()
        showMessageBox('Warning: AI model could not be loaded. Prediction functionality will be limited.');
    }
}
// Load the model once OpenCV.js is ready, or on app init
// For simplicity, calling here directly. In a real app, you might wait for OpenCV.js `onRuntimeInitialized`.
loadModel();

// Magnified view variables
let magnifiedCanvas, magnifiedCtx;
let magnifiedView;

// Add a variable to store the magnification level
let magnificationLevel = 4; // Default magnification level

function appInit() {
    inputCanvas = document.getElementById('inputCanvas');
    outputCanvas = document.getElementById('outputCanvas');
    inputCtx = inputCanvas.getContext('2d');
    outputCtx = outputCanvas.getContext('2d');

    // Initialize magnified view
    magnifiedCanvas = document.getElementById('magnifiedCanvas');
    magnifiedCtx = magnifiedCanvas.getContext('2d');
    magnifiedView = document.getElementById('magnifiedView');

    // Set initial magnified canvas size
    const magnifierSizeSlider = document.getElementById('magnifierSizeSlider');
    const updateMagnifierSize = () => {
        const sizeMultiplier = parseInt(magnifierSizeSlider.value, 10);
        magnifiedCanvas.width = sizeMultiplier * 4;
        magnifiedCanvas.height = sizeMultiplier * 3;
        if (lastSelectedPoint >= 0 && lastSelectedPoint < points.length) {
            const [x, y] = points[lastSelectedPoint];
            updateMagnifiedView(x, y); // Update the magnified view with the new size
        }
    };

    // Add event listener to update magnifier size when slider changes
    magnifierSizeSlider.addEventListener('input', updateMagnifierSize);

    // Initialize magnifier size based on slider value
    updateMagnifierSize();

    document.getElementById('imageUpload').addEventListener('change', handleImageUpload);
    document.getElementById('generateBtn').addEventListener('click', handleGenerate);
    document.addEventListener('keydown', handleKeyDown);
    inputCanvas.addEventListener('mousedown', handleMouseDown);
    inputCanvas.addEventListener('mousemove', handleMouseMove);
    inputCanvas.addEventListener('mouseup', handleMouseUp);
    inputCanvas.addEventListener('mouseleave', handleMouseUp);
    
    // Add mouse move handler for magnified view updates
    inputCanvas.addEventListener('mousemove', handleInputMouseMove);
    
    // Add event listener for output canvas clicks
    outputCanvas.addEventListener('mousedown', handleOutputCanvasClick);
    
    // Load saved image and points on startup
    loadSavedImage();
    // Prevent keydown events from propagating from coordinate input fields
    preventInputFieldKeyPropagation();
}

// Custom message box function (replaces alert())
function showMessageBox(message) {
    const messageBox = document.createElement('div');
    messageBox.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    messageBox.innerHTML = `
        <div class="bg-gray-800 p-6 rounded-lg shadow-lg text-white max-w-sm text-center">
            <p class="mb-4">${message}</p>
            <button onclick="this.parentNode.parentNode.remove()" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
                OK
            </button>
        </div>
    `;
    document.body.appendChild(messageBox);
}

// Ensure OpenCV.js is loaded before initializing the app
if (typeof cv !== 'undefined' && cv.onRuntimeInitialized) {
    cv.onRuntimeInitialized = () => {
        appInit();
    };
} else if (typeof cv !== 'undefined') {
    // Fallback for cases where onRuntimeInitialized might already be called
    appInit();
} else {
    console.error("OpenCV.js not found or not initialized.");
    // You might want to display an error message to the user here.
    showMessageBox("Error: OpenCV.js is not loaded. Image processing features will not work.");
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
    outputCanvas.width = imgElement.width + 100; // Add padding for warped image
    outputCanvas.height = imgElement.height + 100; // Add padding for warped image

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
    // Default points are set 30px from each corner of the image
    return [
        [30, 30],
        [imgElement.width - 30, 30],
        [imgElement.width - 30, imgElement.height - 30],
        [30, imgElement.height - 30]
    ];
}

function savePoints() {
    // Save current points to localStorage if all 4 points are set
    if (points.length === 4) {
        localStorage.setItem('blockDetector_points', JSON.stringify(points));
    }
}

function drawInput() {
    // Clear input canvas and draw the original image
    inputCtx.clearRect(0, 0, inputCanvas.width, inputCanvas.height);
    inputCtx.drawImage(imgElement, 0, 0);

    // Draw lines connecting the 4 points
    inputCtx.strokeStyle = 'lime';
    inputCtx.lineWidth = lineThickness;
    inputCtx.beginPath();
    for (let i = 0; i < points.length; ++i) {
        let p1 = points[i];
        let p2 = points[(i + 1) % points.length];
        // Connect points (p1 to p2, p2 to p3, p3 to p4, p4 to p1)
        inputCtx.moveTo(p1[0], p1[1]);
        inputCtx.lineTo(p2[0], p2[1]);
    }
    inputCtx.stroke();

    // Draw points as circles with labels
    for (let i = 0; i < points.length; ++i) {
        let [x, y] = points[i];
        inputCtx.beginPath();
        // Highlight the last selected/dragged point
        inputCtx.arc(x, y, pointSize + (i === lastSelectedPoint ? 2 : 0), 0, 2 * Math.PI);
        inputCtx.fillStyle = i === lastSelectedPoint ? 'red' : 'lime';
        inputCtx.fill();
        inputCtx.font = '14px Arial';
        inputCtx.fillStyle = 'white';
        // Draw point number
        inputCtx.fillText((i + 1).toString(), x + 8, y + 8);
        // Draw a star next to the selected point
        if (i === lastSelectedPoint) {
            inputCtx.fillText('*', x - 14, y - 10);
        }
    }
    // Save points state
    savePoints();
    
    // Update magnified view to focus on selected point if one is active
    if (lastSelectedPoint >= 0 && lastSelectedPoint < points.length) {
        let [x, y] = points[lastSelectedPoint];
        updateMagnifiedView(x, y);
    }
}

function handleMouseDown(e) {
    if (!imgElement) return; // Do nothing if no image is loaded
    const rect = inputCanvas.getBoundingClientRect();
    // Calculate scale to get true pixel coordinates on the canvas
    const scaleX = inputCanvas.width / rect.width;
    const scaleY = inputCanvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Check if a number key (1-4) is being held for direct point assignment
    if (e.shiftKey || e.ctrlKey || e.altKey) return; // Ignore modifier keys
    const heldKey = Object.keys(keyStates).find(key => key >= '1' && key <= '4' && keyStates[key]); // Check if key is actually held
    if (heldKey) {
        const pointIndex = parseInt(heldKey) - 1;
        if (pointIndex < points.length) {
            points[pointIndex] = [x, y];
            lastSelectedPoint = pointIndex;
            drawInput();
            if (points.length === 4) {
                applyPerspectiveTransform(); // Update transform immediately if all 4 points are set
            }
        }
        return;
    }

    // Debug: draw a crosshair at the click location (temporary visual feedback)
    drawInput(); // Redraw to clear previous crosshair
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

    // Check if clicking on an existing point to drag it
    for (let i = 0; i < points.length; ++i) {
        let [px, py] = points[i];
        if (Math.hypot(x - px, y - py) <= pointSize + 2) // Check within point's visual size
        {
            lastSelectedPoint = i;
            drawInput(); // Redraw to show selected point highlight
            dragging = true;
            dragPointIndex = i;
            return; // Stop after finding a point to drag
        }
    }

    // If not dragging an existing point and less than 4 points exist, add a new point
    if (points.length < 4) {
        points.push([x, y]);
        lastSelectedPoint = points.length - 1; // Select the newly added point
        drawInput();
        if (points.length === 4) {
            applyPerspectiveTransform(); // Apply transform if all 4 points are now set
        }
    }
}

function handleMouseMove(e) {
    if (!imgElement || !dragging || dragPointIndex === -1) return; // Only process if dragging
    const rect = inputCanvas.getBoundingClientRect();
    const scaleX = inputCanvas.width / rect.width;
    const scaleY = inputCanvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    // Update the position of the dragged point
    points[dragPointIndex] = [x, y];
    drawInput(); // Redraw to show updated point position
    // Do NOT update perspective transform here (wait for mouse up for performance)
}

function handleMouseUp(e) {
    dragging = false; // End dragging
    if (dragPointIndex !== -1) lastSelectedPoint = dragPointIndex; // Keep the dragged point selected
    // Only update perspective transform after drag is finished to avoid continuous recalculations
    if (points.length === 4) {
        applyPerspectiveTransform();
    }
    dragPointIndex = -1; // Reset drag index
}

function handleKeyDown(e) {
    if (!imgElement || lastSelectedPoint === -1) return; // Do nothing if no image or no point selected
    let [x, y] = points[lastSelectedPoint];
    let changed = false;
    // Move selected point using WASD
    if (e.key === 'w' || e.key === 'W') { y -= pointMoveStep; changed = true; }
    if (e.key === 's' || e.key === 'S') { y += pointMoveStep; changed = true; }
    if (e.key === 'a' || e.key === 'A') { x -= pointMoveStep; changed = true; }
    if (e.key === 'd' || e.key === 'D') { x += pointMoveStep; changed = true; }
    
    // Select point using number keys (1-4)
    if (e.key >= '1' && e.key <= '4') {
        let idx = parseInt(e.key) - 1;
        if (idx < points.length) {
            lastSelectedPoint = idx;
            drawInput(); // Redraw to highlight new selected point
            // Update magnified view to focus on newly selected point
            let [newX, newY] = points[lastSelectedPoint];
            updateMagnifiedView(newX, newY);
        }
        return; // Do not fall through to other key handlers if a number key was pressed
    }
    
    // Adjust point movement step size
    if (e.key === '+' || e.key === '=') { pointMoveStep = Math.min(10, pointMoveStep + 1); return; }
    if (e.key === '-') { pointMoveStep = Math.max(1, pointMoveStep - 1); return; }
    
    // Reset points to default positions
    if (e.key === 'r' || e.key === 'R') { resetPoints(); return; }
    
    if (changed) {
        // Apply new position to the selected point
        points[lastSelectedPoint] = [x, y];
        drawInput(); // Redraw input canvas
        if (points.length === 4) {
            applyPerspectiveTransform(); // Re-apply transform if all points are set
        }
    }
}

function resetPoints() {
    if (!imgElement) return; // Do nothing if no image is loaded
    points = getDefaultPoints(); // Get default initial points
    lastSelectedPoint = 0; // Select the first point
    squareTexts = {}; // Clear all text labels and their values
    lowConfidenceSquares = {}; // Clear low confidence squares tracking
    drawInput(); // Redraw input canvas
    drawGridOverlay(); // Redraw the grid overlay without labels
    applyPerspectiveTransform(); // Re-apply transform
}

function loadSavedImage() {
    const savedImage = localStorage.getItem('blockDetector_image');
    if (savedImage) {
        imgElement = new window.Image();
        imgElement.onload = function() {
            setupImage(); // Setup canvas and points once image is loaded
        };
        imgElement.src = savedImage;
    }
}

function applyPerspectiveTransform() {
    if (!imgElement || points.length !== 4) {
        // Clear output canvas if no image or not enough points
        outputCtx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
        cleanWarpedCanvas = null;
        return;
    }
    // Calculate center and average side length of the quadrilateral defined by points
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
    let padding = 50; // Padding around the warped image in the output canvas

    // Define destination points for the perspective transform (a perfect square)
    let dst = [
        [cx + padding - halfSide, cy + padding - halfSide], // Top-left
        [cx + padding + halfSide, cy + padding - halfSide], // Top-right
        [cx + padding + halfSide, cy + padding + halfSide], // Bottom-right
        [cx + padding - halfSide, cy + padding + halfSide]  // Bottom-left
    ];
    squareDst = dst; // Store destination points for grid drawing

    // Perform perspective transform using OpenCV.js
    let srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, points.flat()); // Source points from user input
    let dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, dst.flat());   // Destination points (perfect square)
    let dsize = new cv.Size(imgElement.width + 2 * padding, imgElement.height + 2 * padding); // Size of the output canvas
    if (warpedMat) warpedMat.delete(); // Release previous warped matrix if exists
    warpedMat = new cv.Mat(); // Create new matrix for warped image
    let M = cv.getPerspectiveTransform(srcTri, dstTri); // Get perspective transformation matrix
    cv.warpPerspective(srcMat, warpedMat, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar()); // Apply transform
    
    // Release memory
    srcTri.delete();
    dstTri.delete();
    M.delete();

    // Draw the warped image to the output canvas
    cv.imshow(outputCanvas, warpedMat);

    // Save a clean copy of the warped image *before* drawing grid lines
    cleanWarpedCanvas = document.createElement('canvas');
    cleanWarpedCanvas.width = outputCanvas.width;
    cleanWarpedCanvas.height = outputCanvas.height;
    let cleanCtx = cleanWarpedCanvas.getContext('2d');
    cleanCtx.drawImage(outputCanvas, 0, 0);

    // Draw the grid overlay on the output canvas
    drawGridOverlay();
}

let squareTexts = {}; // Stores detection results for each square: { 'i,j': 'class (confidence%)' }

function preprocessCanvasForModel(canvas) {
    // Create a temporary canvas and resize the cropped square to 64x64 pixels
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
        // Grayscale conversion: 0.299*R + 0.587*G + 0.114*B
        let v = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
        gray.push(v); // Store raw pixel values [0,255]. Model's Rescaling layer will handle normalization.
    }
    // Convert the grayscale pixel data into a TensorFlow.js tensor with shape [1, 64, 64, 1]
    let tensor = tf.tensor(gray, [64, 64, 1]).expandDims(0);
    return tensor;
}

// Function to run AI prediction on a given cropped canvas (grid square)
async function runOnSquare(croppedCanvas, info) {
    if (!tfModel) return 'Model Loading...'; // Indicate model is not ready

    console.log(`=== Debug: Processing square (${info.i}, ${info.j}) ===`);
    
    // Preprocess the cropped image for the model
    let inputTensor = preprocessCanvasForModel(croppedCanvas);
    
    // Make prediction using the loaded TensorFlow.js model
    let prediction = tfModel.predict(inputTensor);
    let data = await prediction.data(); // Get prediction probabilities
    console.log('Raw prediction data:', Array.from(data));
    
    // Determine the predicted class (index of highest probability) and its confidence
    let predictedClass = data.indexOf(Math.max(...data));
    let confidence = Math.max(...data);
    
    console.log('Class probabilities:');
    for (let i = 0; i < data.length; i++) {
        console.log(`  Class ${classNames[i]}: ${(data[i] * 100).toFixed(2)}%`);
    }
    console.log(`Predicted class: ${classNames[predictedClass]} (index: ${predictedClass})`);
    console.log(`Confidence: ${(confidence * 100).toFixed(2)}%`);
    console.log('=== End Debug ===');
    
    // Dispose tensors to free up memory
    inputTensor.dispose();
    prediction.dispose();
    
    // Return formatted result string
    return `${classNames[predictedClass]} (${(confidence*100).toFixed(1)}%)`;
}

// Handle clicks on the output canvas to trigger AI prediction for a square
async function handleOutputCanvasClick(e) {
    // Only respond to left mouse button (button 0)
    if (e.button !== 0) return;

    if (!cleanWarpedCanvas || !squareDst) return; // Ensure warped image and square data exist
    const rect = outputCanvas.getBoundingClientRect();
    // Calculate click coordinates relative to the canvas's true pixel size
    const scaleX = outputCanvas.width / rect.width;
    const scaleY = outputCanvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Determine which grid square was clicked
    let squarePoints = squareDst.map(pt => [Math.round(pt[0]), Math.round(pt[1])]);
    // Calculate the size of one grid square based on the warped square's side length
    let avgSide = Math.hypot(squarePoints[1][0] - squarePoints[0][0], squarePoints[1][1] - squarePoints[0][1]);
    let sSize = Math.round(avgSide);
    
    // Calculate the top-left origin of the main warped square
    let gridOriginX = squarePoints[0][0];
    let gridOriginY = squarePoints[0][1];
    
    // Calculate grid indices (i, j) of the clicked square
    let i = Math.floor((x - gridOriginX) / sSize);
    let j = Math.floor((y - gridOriginY) / sSize);
    
    // Calculate top-left and bottom-right pixel coordinates of the clicked grid square
    let tlx = gridOriginX + i * sSize;
    let tly = gridOriginY + j * sSize;
    let brx = tlx + sSize;
    let bry = tly + sSize;

    // Check if the calculated square coordinates are within the canvas bounds
    if (tlx < 0 || tly < 0 || brx > outputCanvas.width || bry > outputCanvas.height) return;

    // Create a unique key for the clicked square
    let squareKey = `${i},${j}`;

    

    // If the square already has text, clear its data and remove the text
    if (squareTexts[squareKey]) {
        delete squareTexts[squareKey]; // Remove the text data for the square
        drawGridOverlay(); // Redraw the grid without the text
        return;
    }

    // Create a temporary canvas to crop the selected grid square
    let cropCanvas = document.createElement('canvas');
    cropCanvas.width = sSize;
    cropCanvas.height = sSize;
    let cropCtx = cropCanvas.getContext('2d');
    // Draw the specific portion of the clean warped image onto the crop canvas
    cropCtx.drawImage(cleanWarpedCanvas, tlx, tly, sSize, sSize, 0, 0, sSize, sSize);

    // Show loading text immediately on the clicked square
    squareTexts[squareKey] = '...';
    drawGridOverlay(); // Redraw grid with loading text

    // Run AI prediction and update the square's text with the result
    let resultText = await runOnSquare(cropCanvas, { i, j, x, y });
    
    // Check if confidence is below 70%
    let confidence = parseFloat(resultText.match(/\(([\d.]+)%\)/)?.[1] || '0');
    if (confidence < 84) {
        // Store this square as having low confidence
        lowConfidenceSquares[squareKey] = {
            confidence: confidence,
            class: resultText.split(' ')[0]
        };
        // Remove the text and don't allow clicking on low confidence squares
        delete squareTexts[squareKey];
        drawGridOverlay(); // Redraw grid without the text
        return;
    }
    
    squareTexts[squareKey] = resultText;
    drawGridOverlay(); // Redraw grid with prediction result

    // Redraw input canvas (not strictly necessary for output canvas click, but good for consistency)
    drawInput();
}

function drawGridOverlay() {
    if (!warpedMat) return; // Do nothing if no warped image

    let ctx = outputCtx;
    ctx.save(); // Save current canvas state

    // Reset output canvas to the clean warped image before drawing new grid/text
    if (cleanWarpedCanvas) {
        ctx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
        ctx.drawImage(cleanWarpedCanvas, 0, 0);
    }

    ctx.lineWidth = 1;
    ctx.strokeStyle = 'lime'; // Grid line color

    let squarePoints = squareDst.map(pt => [Math.round(pt[0]), Math.round(pt[1])]);
    let avgSide = Math.hypot(squarePoints[1][0] - squarePoints[0][0], squarePoints[1][1] - squarePoints[0][1]);
    squareSize = Math.round(avgSide); // The size of each square in the grid

    let w = outputCanvas.width;
    let h = outputCanvas.height;

    // Draw horizontal grid lines
    for (let y = squarePoints[0][1]; y < h; y += squareSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
    }
    for (let y = squarePoints[0][1]; y > 0; y -= squareSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
    }

    // Draw vertical grid lines
    for (let x = squarePoints[0][0]; x > 0; x -= squareSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
    }
    for (let x = squarePoints[1][0]; x < w; x += squareSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
    }

    // Draw the main warped square outline in red
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

    // Draw text (detection info and grid position) on each detected square
    for (let key in squareTexts) {
        let [i, j] = key.split(',').map(Number); // Parse grid indices from key

        // Calculate the center of the current grid square
        let tlx = squarePoints[0][0] + i * squareSize;
        let tly = squarePoints[0][1] + j * squareSize;
        let centerX = tlx + squareSize / 2;
        let centerY = tly + squareSize / 2;

        // Calculate font size proportional to 5/6 of the square width, divided by 1 + string length
        let yellowFontSize = Math.round((3 / 4) * squareSize / ((squareTexts[key].length)/2));
        ctx.font = `${yellowFontSize}px Arial`;
        ctx.fillStyle = 'yellow';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(squareTexts[key], centerX, centerY - 10);

        // Calculate font size proportional to 24/26 of the yellow font size
        ctx.font = `${Math.round((24 / 26) * yellowFontSize)}px Arial`;
        ctx.fillStyle = 'cyan';
        ctx.fillText(`(${i},${j})`, centerX, centerY + 10);
    }

    // Draw visual overlay for squares with low confidence
    for (let key in lowConfidenceSquares) {
        let [i, j] = key.split(',').map(Number); // Parse grid indices from key

        // Calculate the position of the current grid square
        let tlx = squarePoints[0][0] + i * squareSize;
        let tly = squarePoints[0][1] + j * squareSize;

        // Draw a semi-transparent red overlay to indicate low confidence
        ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
        ctx.fillRect(tlx, tly, squareSize, squareSize);

        // Draw a red border around the square
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 2;
        ctx.strokeRect(tlx, tly, squareSize, squareSize);

        // Add text indicating low confidence
        let centerX = tlx + squareSize / 2;
        let centerY = tly + squareSize / 2;
        ctx.font = `${Math.round(squareSize / 8)}px Arial`;
        ctx.fillStyle = 'red';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Low Confidence', centerX, centerY);
    }
    ctx.restore(); // Restore saved canvas state
}

// Dynamically update labels when the second image changes
function updateLabelsOnImageChange() {
    if (!cleanWarpedCanvas || !squareDst) return;

    // Clear existing labels
    squareTexts = {};
    // Clear low confidence squares tracking
    lowConfidenceSquares = {};

    // Redraw the grid overlay to reflect the new image
    drawGridOverlay();
}

// Call `updateLabelsOnImageChange` whenever the second image changes
document.getElementById('imageUpload').addEventListener('change', () => {
    updateLabelsOnImageChange();
});

function showMagnifiedView(x, y) {
    if (!imgElement) return;
    
    magnifiedView.style.display = 'flex';
    updateMagnifiedView(x, y);
}

function hideMagnifiedView() {
    magnifiedView.style.display = 'none';
}

// Update the magnified view function to zoom from the center
function updateMagnifiedView(x, y) {
    if (!imgElement || !magnifiedCanvas) return;

    const zoom = magnificationLevel; // Use the magnification level from the slider
    const magnifiedWidth = magnifiedCanvas.width;
    const magnifiedHeight = magnifiedCanvas.height;

    // Calculate the area to capture from the original image, clamping to image bounds
    const sourceWidth = magnifiedWidth / zoom;
    const sourceHeight = magnifiedHeight / zoom;
    const sourceX = Math.max(0, Math.min(x - sourceWidth / 2, imgElement.width - sourceWidth));
    const sourceY = Math.max(0, Math.min(y - sourceHeight / 2, imgElement.height - sourceHeight));

    // Clear the magnified canvas
    magnifiedCtx.clearRect(0, 0, magnifiedWidth, magnifiedHeight);

    // Draw the magnified portion directly from the original image
    magnifiedCtx.drawImage(
        imgElement,
        sourceX, sourceY, sourceWidth, sourceHeight, // Source rectangle from the original image
        0, 0, magnifiedWidth, magnifiedHeight // Destination rectangle on the magnified canvas
    );

    // Draw a red crosshair at the center of the magnified view
    magnifiedCtx.strokeStyle = 'red';
    magnifiedCtx.lineWidth = 2;
    magnifiedCtx.beginPath();
    magnifiedCtx.moveTo(magnifiedWidth / 2 - 10, magnifiedHeight / 2);
    magnifiedCtx.lineTo(magnifiedWidth / 2 + 10, magnifiedHeight / 2);
    magnifiedCtx.moveTo(magnifiedWidth / 2, magnifiedHeight / 2 - 10);
    magnifiedCtx.lineTo(magnifiedWidth / 2, magnifiedHeight / 2 + 10);
    magnifiedCtx.stroke();

    // Update coordinates display
    document.getElementById('magnifiedCoords').textContent = `X: ${Math.round(x)}, Y: ${Math.round(y)}`;
}

// Add an event listener to the magnification slider
document.getElementById('magnificationSlider').addEventListener('input', (e) => {
    magnificationLevel = parseInt(e.target.value, 25); // Update the magnification level
    if (lastSelectedPoint >= 0 && lastSelectedPoint < points.length) {
        const [x, y] = points[lastSelectedPoint];
        updateMagnifiedView(x, y); // Update the magnified view with the new level
    }
});

function handleInputMouseMove(e) {
    if (!imgElement) return;
    
    // Only update magnified view if no point is currently selected or if a point is being dragged
    if (lastSelectedPoint === -1 || dragging) {
        const rect = inputCanvas.getBoundingClientRect();
        const scaleX = inputCanvas.width / rect.width;
        const scaleY = inputCanvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        
        // Update magnified view with current mouse position
        updateMagnifiedView(x, y);
    }
}

function handleGenerate() {
    const generationType = document.getElementById('generationType').value;
    const orientation = document.getElementById('orientation').value;

    // Retrieve coordinate inputs for relative offsets
    const { relativeX, relativeY, relativeZ } = getCoordinateInputs();
    // Get the state of the direction correction checkbox
    const directionCorrectionEnabled = document.getElementById('directionCorrectionCheckbox')?.checked ?? true;
    generateRaw(orientation, generationType, relativeX, relativeY, relativeZ, directionCorrectionEnabled);
}

// Function to retrieve numerical values from relative coordinate input fields
function getCoordinateInputs() {
    const relativeX = parseFloat(document.getElementById('relativeX').value) || 0;
    const relativeY = parseFloat(document.getElementById('relativeY').value) || 0;
    const relativeZ = parseFloat(document.getElementById('relativeZ').value) || 0;

    return { relativeX, relativeY, relativeZ };
}

function generateRaw(orientation = 'wall', type = 'raw', relativeX, relativeY, relativeZ, directionCorrectionEnabled = true) {
    if (!squareDst || Object.keys(squareTexts).length === 0) {
        showMessageBox('No detected squares found. Please click on some squares in the warped output to run detection first.');
        return;
    }

    // Determine separator based on output type
    const separator = type === 'spaced' ? ' ' : ',';

    // Calculate min/max grid indices to determine the extent of the detected area
    let minI = Infinity, maxI = -Infinity;
    let minJ = Infinity, maxJ = -Infinity;

    for (let key in squareTexts) {
        let [i, j] = key.split(',').map(Number);
        minI = Math.min(minI, i);
        maxI = Math.max(maxI, i);
        minJ = Math.min(minJ, j);
        maxJ = Math.max(maxJ, j);
    }

    // Calculate the center of the detected grid for centering logic
    let centerI = Math.floor((minI + maxI) / 2);
    let centerJ = Math.floor((minJ + maxJ) / 2);

    let output = ''; // String to build the final generated output
    let formationText = ''; // Temporary formation text for direction detection

    // First pass: Generate formation.add lines for direction detection
    for (let key in squareTexts) {
        let [i, j] = key.split(',').map(Number); // Current square's grid indices
        let detectedClass = squareTexts[key].split(' ')[0]; // Extract class from "Class (Confidence%)"

        let finalCoordX; // Final X coordinate for output
        let finalCoordY; // Final Y coordinate for output
        let finalCoordZ; // Final Z coordinate for output
        let isWallForRotationInfo; // Boolean for RotationInfo constructor

        // Conditional logic for coordinates based on type and orientation
        if (type === 'rotationinfo' && orientation === 'ground') {
            // Special case: RotationInfo + Ground -> use raw i, j for X, Z
            finalCoordX = i;
            finalCoordY = 0; // Y for ground is a fixed offset, currently 0
            finalCoordZ = j;
            isWallForRotationInfo = false;
        } else {
            // General case: use centered coordinates relative to the detected grid's center
            let x_centered = i
            let y_centered = j
            let fixed_offset_dimension = 0; // The fixed offset for the third dimension (wall's Z or ground's Y)

            if (orientation === 'ground') {
                finalCoordX = x_centered;
                finalCoordY = fixed_offset_dimension;
                finalCoordZ = y_centered; // For ground, the 'y_centered' from grid becomes the Z-axis
                isWallForRotationInfo = false;
            } else { // orientation === 'wall'
                finalCoordX = x_centered;
                finalCoordY = y_centered; // For wall, the 'y_centered' from grid becomes the Y-axis
                finalCoordZ = fixed_offset_dimension;
                isWallForRotationInfo = true;
            }
        }

        // Apply relative offsets to the calculated coordinates
        finalCoordX += relativeX;
        finalCoordY += relativeY;
        finalCoordZ += relativeZ;

        // Build formation text for direction detection
        formationText += `formation.add(new RotationInfo(${finalCoordX}, ${finalCoordY}, ${finalCoordZ}, ${detectedClass}, ${isWallForRotationInfo}));\n`;
    }

    // Detect the cluster facing direction
    const detectedDirection = determineClusterFacing(formationText);
    console.log(`Detected direction: ${detectedDirection}`);

    // Second pass: Generate final output with adjusted coordinates
    for (let key in squareTexts) {
        let [i, j] = key.split(',').map(Number); // Current square's grid indices
        let detectedClass = squareTexts[key].split(' ')[0]; // Extract class from "Class (Confidence%)"

        let finalCoordX; // Final X coordinate for output
        let finalCoordY; // Final Y coordinate for output
        let finalCoordZ; // Final Z coordinate for output
        let isWallForRotationInfo; // Boolean for RotationInfo constructor

        // Conditional logic for coordinates based on type and orientation
        if (type === 'rotationinfo' && orientation === 'ground') {
            // Special case: RotationInfo + Ground -> use raw i, j for X, Z
            finalCoordX = i;
            finalCoordY = 0; // Y for ground is a fixed offset, currently 0
            finalCoordZ = j;
            isWallForRotationInfo = false;
        } else {
            // General case: use centered coordinates relative to the detected grid's center
            let x_centered = i
            let y_centered = j
            let fixed_offset_dimension = 0; // The fixed offset for the third dimension (wall's Z or ground's Y)

            if (orientation === 'ground') {
                finalCoordX = x_centered;
                finalCoordY = fixed_offset_dimension;
                finalCoordZ = y_centered; // For ground, the 'y_centered' from grid becomes the Z-axis
                isWallForRotationInfo = false;
            } else { // orientation === 'wall'
                finalCoordX = x_centered;
                finalCoordY = y_centered; // For wall, the 'y_centered' from grid becomes the Y-axis
                finalCoordZ = fixed_offset_dimension;
                isWallForRotationInfo = true;
            }
        }

        // Apply relative offsets to the calculated coordinates
        finalCoordX += relativeX;
        finalCoordY += relativeY;
        finalCoordZ += relativeZ;

        // Adjust coordinates based on detected direction (only for X and Z)
        if (directionCorrectionEnabled && detectedDirection && detectedDirection !== "North") {
            [finalCoordX, finalCoordZ] = adjustCoordinatesForDirection(finalCoordX, finalCoordZ, detectedDirection);
        }

        // Construct the output string based on the selected generation type
        if (type === 'raw') {
            output += `${finalCoordX}${separator}${finalCoordY}${separator}${finalCoordZ}${separator}${detectedClass}\n`;
        } else if (type === 'rotationinfo') {
            output += `formation.add(new RotationInfo(${finalCoordX}, ${finalCoordY}, ${finalCoordZ}, ${detectedClass}, ${isWallForRotationInfo}));\n`;
        }
    }

    // Display the generated output in the dedicated section
    
    const directionInfo = detectedDirection ? ` (Adjusted for ${detectedDirection} facing)` : '';
    const title = `${orientation.charAt(0).toUpperCase() + orientation.slice(1)} ${type.charAt(0).toUpperCase() + type.slice(1)} Data${directionInfo}`;
    if (directionCorrectionEnabled) {
    displayGeneratedOutput(output, title);
    } else {
        displayGeneratedOutput(output,' ');
    }
    console.log('Generated data:', output);
}

function displayGeneratedOutput(output, title) {
    // Get or create the output display div
    let outputDisplay = document.getElementById('generatedOutput');
    if (!outputDisplay) {
        outputDisplay = document.createElement('div');
        outputDisplay.id = 'generatedOutput';
        outputDisplay.className = 'generated-output';
        document.querySelector('.generate-section').appendChild(outputDisplay);
    }
    
    // Populate the output display with the generated text and a download button
    outputDisplay.innerHTML = `
        <h4>${title}</h4>
        <div class="code-block">
            <pre><code>${output}</code></pre>
        </div>
        <button onclick="downloadGeneratedOutput('${output.replace(/\n/g, '\\n')}', 'detected_squares.txt')" class="download-btn">
            Download as .txt
        </button>
    `;
}

function downloadGeneratedOutput(content, filename) {
    // Create a Blob from the content
    const blob = new Blob([content], { type: 'text/plain' });
    // Create a URL for the Blob
    const url = URL.createObjectURL(blob);
    // Create a temporary anchor element to trigger download
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a); // Append to body to ensure it's in the DOM for click
    a.click(); // Programmatically click the anchor to start download
    document.body.removeChild(a); // Clean up the temporary element
    URL.revokeObjectURL(url); // Release the Blob URL
}

// Global object to track key states (which keys are currently pressed)
let keyStates = {};

document.addEventListener('keydown', (e) => {
    keyStates[e.key] = true;
});

document.addEventListener('keyup', (e) => {
    delete keyStates[e.key];
});

// Prevents keyboard events from input fields from affecting canvas controls
function preventInputFieldKeyPropagation() {
    const coordinateInputs = document.querySelectorAll('.coordinate-inputs input');
    coordinateInputs.forEach(input => {
        input.addEventListener('keydown', (e) => {
            e.stopPropagation(); // Stop the event from bubbling up to the document
        });
    });
}

// Call this function during app initialization to set up input field key handlers
// document.addEventListener('DOMContentLoaded', () => { // This is handled by appInit call within opencv.js runtime check
//     preventInputFieldKeyPropagation();
// });

// --- Direction Detection Functions (ported from Python) ---
const DIRECTIONS = ["North", "West", "South", "East"]; // 0, 1, 2, 3

function parseFormationAddLines(formationText) {
    const blocks = [];
    const pattern = /formation\.add\(new RotationInfo\(\s*(-?\d+),\s*(-?\d+),\s*(-?\d+),\s*(\d+),\s*(true|false)\s*\)\);/g;
    
    let match;
    while ((match = pattern.exec(formationText)) !== null) {
        const x = parseInt(match[1]);
        const y = parseInt(match[2]);
        const z = parseInt(match[3]);
        const rot = parseInt(match[4]);
        blocks.push({
            x: x,
            y: y,
            z: z,
            rot: rot % 4
        });
    }
    
    return blocks;
}

function unrotate(x, z, rot) {
    rot = rot % 4;
    if (rot === 0) { // North
        return [x, z];
    } else if (rot === 1) { // West
        return [-z, x];
    } else if (rot === 2) { // South
        return [-x, -z];
    } else if (rot === 3) { // East
        return [z, -x];
    }
}

function findOriginBlock(blocks) {
    for (const block of blocks) {
        const [unrotX, unrotZ] = unrotate(block.x, block.z, block.rot);
        if (unrotX === 0 && unrotZ === 0) {
            return block;
        }
    }
    return null;
}

function determineClusterFacing(formationText) {
    const blocks = parseFormationAddLines(formationText);
    
    if (blocks.length === 0) {
        console.log("No blocks found in formation text");
        return null;
    }
    
    console.log("--- Scanned Blocks ---");
    for (const b of blocks) {
        console.log(`Block at (${b.x}, ${b.z}) rotation ${b.rot}`);
    }
    
    const originBlock = findOriginBlock(blocks);
    
    if (originBlock === null) {
        console.log("Could not find a block that originated at (0,0).");
        return null;
    }
    
    const scannedRotation = originBlock.rot % 4;
    const facing = DIRECTIONS[scannedRotation];
    
    console.log(`Original cluster facing direction: ${facing} (rotation ${scannedRotation})`);
    return facing;
}

function adjustCoordinatesForDirection(x, z, detectedDirection) {
    // Convert coordinates based on detected direction
    // Assuming North is the default (neg z, pos x)
    switch (detectedDirection) {
        case "North": // Default, no change needed
            return [x, z];
        case "West": // Rotate 90 degrees counterclockwise
            return [z, -x];
        case "South": // Rotate 180 degrees
            return [-x, -z];
        case "East": // Rotate 90 degrees clockwise
            return [-z, x];
        default:
            return [x, z]; // Default to North if unknown
    }
}
