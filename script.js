document.addEventListener('DOMContentLoaded', function() {
    const calculateBtn = document.getElementById('calculateBtn');
    const parseBtn = document.getElementById('parseBtn');
    const saveBtn = document.getElementById('saveBtn');
    const deleteBtn = document.getElementById('deleteBtn');
    const exportDxfBtn = document.getElementById('exportDxfBtn');
    const copyDxfBtn = document.getElementById('copyDxfBtn');
    const savedList = document.getElementById('savedList');
    const boxWidthInput = document.getElementById('boxWidth');
    const boxHeightInput = document.getElementById('boxHeight');
    const boxDepthInput = document.getElementById('boxDepth');
    const driverSizeInput = document.getElementById('driverSize');
    const dxfContent = document.getElementById('dxfContent');
    const results = document.getElementById('results');
    
    let scene, camera, renderer, controls, speakerBox;
    let db;
    let currentCalculation = null;

    initSQLite();
    initThreeJS();
    
    // Load saved API key
    const savedApiKey = localStorage.getItem('openrouterApiKey');
    if (savedApiKey) {
        document.getElementById('apiKey').value = savedApiKey;
    }
    
    // Save API key when changed
    document.getElementById('apiKey').addEventListener('input', function() {
        localStorage.setItem('openrouterApiKey', this.value);
    });

    // Real-time dimension adjustment
    boxWidthInput.addEventListener('input', updateBoxAndDxf);
    boxHeightInput.addEventListener('input', updateBoxAndDxf);
    boxDepthInput.addEventListener('input', updateBoxAndDxf);
    driverSizeInput.addEventListener('input', updateBoxAndDxf);

    function updateBoxAndDxf() {
        updateBoxDimensions();
        updateDxfContent();
    }

    function updateDxfContent() {
        const width = parseFloat(boxWidthInput.value) || 3;
        const height = parseFloat(boxHeightInput.value) || 4.8;
        const depth = parseFloat(boxDepthInput.value) || 1.8;
        const driverSize = parseFloat(driverSizeInput.value) || 12;
        
        dxfContent.value = generateDXF(width, height, depth, driverSize);
    }

    copyDxfBtn.addEventListener('click', function() {
        dxfContent.select();
        document.execCommand('copy');
        this.textContent = 'Copied!';
        setTimeout(() => {
            this.textContent = 'Copy DXF';
        }, 2000);
    });

    function updateBoxDimensions() {
        const width = parseFloat(boxWidthInput.value) || 3;
        const height = parseFloat(boxHeightInput.value) || 4.8;
        const depth = parseFloat(boxDepthInput.value) || 1.8;
        
        if (speakerBox) {
            scene.remove(speakerBox);
        }
        
        const geometry = new THREE.BoxGeometry(width, height, depth);
        const material = new THREE.MeshBasicMaterial({ color: 0x8B4513 });
        speakerBox = new THREE.Mesh(geometry, material);
        
        // Add wireframe edges
        const edges = new THREE.EdgesGeometry(geometry);
        const lineMaterial = new THREE.LineBasicMaterial({ color: 0x87CEEB }); // Light blue
        const wireframe = new THREE.LineSegments(edges, lineMaterial);
        speakerBox.add(wireframe);
        
        // Add speaker driver - centered horizontally, golden ratio vertically
        const driverSize = parseFloat(driverSizeInput.value) || 12;
        const driverRadius = driverSize / 2; // Convert diameter to radius
        const driverGeometry = new THREE.CircleGeometry(driverRadius, 32);
        const driverMaterial = new THREE.MeshBasicMaterial({ color: 0x333333 });
        const driver = new THREE.Mesh(driverGeometry, driverMaterial);
        
        // Center horizontally, golden ratio vertically
        const offsetX = 0; // Centered horizontally
        const offsetY = (height * 0.382) - (height / 2); // Golden ratio from bottom
        
        driver.position.set(offsetX, offsetY, depth / 2 + 0.01);
        speakerBox.add(driver);
        
        scene.add(speakerBox);
    }

    async function initSQLite() {
        const SQL = await initSqlJs({
            locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
        });
        
        // Load existing database from localStorage or create new
        const savedDb = localStorage.getItem('speakerCalcDB');
        if (savedDb) {
            const uInt8Array = new Uint8Array(JSON.parse(savedDb));
            db = new SQL.Database(uInt8Array);
        } else {
            db = new SQL.Database();
            db.run(`CREATE TABLE calculations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE,
                parsed_text TEXT,
                fs REAL,
                qts REAL,
                vas REAL,
                enclosure_type TEXT,
                width REAL,
                height REAL,
                depth REAL,
                volume REAL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);
        }
        
        loadSavedList();
    }

    function saveDatabase() {
        const data = db.export();
        localStorage.setItem('speakerCalcDB', JSON.stringify(Array.from(data)));
    }

    function loadSavedList() {
        const stmt = db.prepare("SELECT id, name FROM calculations ORDER BY created_at DESC");
        savedList.innerHTML = '<option value="">Load saved calculation...</option>';
        
        while (stmt.step()) {
            const row = stmt.getAsObject();
            const option = document.createElement('option');
            option.value = row.id;
            option.textContent = row.name;
            savedList.appendChild(option);
        }
        stmt.free();
    }

    saveBtn.addEventListener('click', function() {
        const name = document.getElementById('saveName').value.trim();
        if (!name || !currentCalculation) {
            alert('Please enter a name and calculate first!');
            return;
        }

        try {
            db.run(`INSERT OR REPLACE INTO calculations 
                (name, parsed_text, fs, qts, vas, enclosure_type, width, height, depth, volume)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                name,
                currentCalculation.parsedText || '',
                currentCalculation.fs,
                currentCalculation.qts,
                currentCalculation.vas,
                currentCalculation.enclosureType,
                currentCalculation.dimensions.width,
                currentCalculation.dimensions.height,
                currentCalculation.dimensions.depth,
                currentCalculation.volume
            ]);
            
            saveDatabase();
            loadSavedList();
            document.getElementById('saveName').value = '';
            alert('Calculation saved!');
        } catch (e) {
            alert('Error saving: ' + e.message);
        }
    });

    savedList.addEventListener('change', function() {
        const id = this.value;
        if (!id) return;

        const stmt = db.prepare("SELECT * FROM calculations WHERE id = ?");
        stmt.bind([id]);
        
        if (stmt.step()) {
            const row = stmt.getAsObject();
            
            // Load parameters
            document.getElementById('fs').value = row.fs;
            document.getElementById('qts').value = row.qts;
            document.getElementById('vas').value = row.vas;
            document.getElementById('enclosureType').value = row.enclosure_type;
            document.getElementById('pasteText').value = row.parsed_text;
            
            // Recalculate and display
            calculateBtn.click();
        }
        stmt.free();
    });

    deleteBtn.addEventListener('click', function() {
        const id = savedList.value;
        if (!id || !confirm('Delete this calculation?')) return;

        db.run("DELETE FROM calculations WHERE id = ?", [id]);
        saveDatabase();
        loadSavedList();
        savedList.value = '';
    });

    exportDxfBtn.addEventListener('click', function() {
        const width = parseFloat(boxWidthInput.value) || 3;
        const height = parseFloat(boxHeightInput.value) || 4.8;
        const depth = parseFloat(boxDepthInput.value) || 1.8;
        const driverSize = parseFloat(driverSizeInput.value) || 12;
        
        const dxfContent = generateDXF(width, height, depth, driverSize);
        downloadFile(dxfContent, 'speaker_box.dxf', 'application/dxf');
    });

    function generateDXF(width, height, depth, driverSize = 12) {
        // Convert cm to mm for DXF
        const w = width * 10;
        const h = height * 10;
        const d = depth * 10;
        
        // Calculate driver position - centered horizontally, golden ratio vertically
        const driverX = w / 2; // Centered horizontally
        const driverY = h * 0.382; // Golden ratio from bottom
        const driverRadius = (driverSize * 10) / 2; // Convert cm to mm, diameter to radius
        
        return `0
SECTION
2
HEADER
9
$ACADVER
1
AC1015
0
ENDSEC
0
SECTION
2
TABLES
0
ENDSEC
0
SECTION
2
BLOCKS
0
ENDSEC
0
SECTION
2
ENTITIES
999
Front Panel (${width}x${height}cm)
0
LINE
8
0
10
0
20
0
11
${w}
21
0
0
LINE
8
0
10
${w}
20
0
11
${w}
21
${h}
0
LINE
8
0
10
${w}
20
${h}
11
0
21
${h}
0
LINE
8
0
10
0
20
${h}
11
0
21
0
0
CIRCLE
8
0
10
${driverX}
20
${driverY}
40
${driverRadius}
999
Side Panel (${depth}x${height}cm) - Cut 2
0
LINE
8
0
10
0
20
${h + 50}
11
${d}
21
${h + 50}
0
LINE
8
0
10
${d}
20
${h + 50}
11
${d}
21
${h * 2 + 50}
0
LINE
8
0
10
${d}
20
${h * 2 + 50}
11
0
21
${h * 2 + 50}
0
LINE
8
0
10
0
20
${h * 2 + 50}
11
0
21
${h + 50}
999
Top/Bottom Panel (${width}x${depth}cm) - Cut 2
0
LINE
8
0
10
${w + 50}
20
0
11
${w + d + 50}
21
0
0
LINE
8
0
10
${w + d + 50}
20
0
11
${w + d + 50}
21
${w}
0
LINE
8
0
10
${w + d + 50}
20
${w}
11
${w + 50}
21
${w}
0
LINE
8
0
10
${w + 50}
20
${w}
11
${w + 50}
21
0
0
ENDSEC
0
EOF`;
    }

    function downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    parseBtn.addEventListener('click', async function() {
        const text = document.getElementById('pasteText').value.trim();
        const apiKey = document.getElementById('apiKey').value.trim();
        
        if (!text) {
            results.innerHTML = '<p style="color: red;">Please paste some text to parse!</p>';
            return;
        }
        
        if (!apiKey) {
            results.innerHTML = '<p style="color: red;">Please enter your OpenRouter API key!</p>';
            return;
        }

        parseBtn.textContent = 'Parsing...';
        parseBtn.disabled = true;

        try {
            const params = await parseWithOpenRouter(text, apiKey);
            if (params.fs) document.getElementById('fs').value = params.fs;
            if (params.qts) document.getElementById('qts').value = params.qts;
            if (params.vas) document.getElementById('vas').value = params.vas;
            
            results.innerHTML = '<p style="color: green;">Parameters extracted successfully!</p>';
        } catch (error) {
            results.innerHTML = `<p style="color: red;">Error parsing text: ${error.message}</p>`;
        }

        parseBtn.textContent = 'Parse Parameters';
        parseBtn.disabled = false;
    });

    async function parseWithOpenRouter(text, apiKey) {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': 'http://localhost',
                'X-Title': 'Speaker Calculator',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'openai/gpt-4o-mini',
                messages: [{
                    role: 'user',
                    content: `Extract T/S parameters from this speaker specification text. Return ONLY a JSON object with fs, qts, and vas values (numbers only, no units). If a parameter isn't found, omit it from the JSON.

Text: ${text}`
                }]
            })
        });

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status}`);
        }

        const data = await response.json();
        const content = data.choices[0].message.content.trim();
        
        // Extract JSON from response
        const jsonMatch = content.match(/\{[^}]+\}/);
        if (!jsonMatch) {
            throw new Error('No valid parameters found');
        }

        return JSON.parse(jsonMatch[0]);
    }

    calculateBtn.addEventListener('click', function() {
        const fs = parseFloat(document.getElementById('fs').value);
        const qts = parseFloat(document.getElementById('qts').value);
        const vas = parseFloat(document.getElementById('vas').value);
        const enclosureType = document.getElementById('enclosureType').value;

        if (!fs || !qts || !vas) {
            results.innerHTML = '<p style="color: red;">Please fill in all T/S parameters!</p>';
            return;
        }

        let calculations;
        if (enclosureType === 'sealed') {
            calculations = calculateSealed(fs, qts, vas);
        } else {
            calculations = calculatePorted(fs, qts, vas);
        }

        const dims = calculateDimensions(calculations.vb);
        
        // Store current calculation
        currentCalculation = {
            parsedText: document.getElementById('pasteText').value,
            fs: fs,
            qts: qts,
            vas: vas,
            enclosureType: enclosureType,
            dimensions: dims,
            volume: calculations.vb
        };

        displayResults(calculations, enclosureType);
    });

    function calculateSealed(fs, qts, vas) {
        // Sealed box calculations
        const qtc = 0.707; // Target Qtc for flat response
        const alpha = (qtc / qts) ** 2 - 1;
        const vb = vas / alpha; // Box volume in liters
        
        const f3 = fs * Math.sqrt((qtc / qts) ** 2); // -3dB frequency
        
        return { vb, f3, qtc };
    }

    function calculatePorted(fs, qts, vas) {
        // Ported box calculations (simplified)
        const vb = vas * 2.5; // Typical ported box volume
        const fb = fs * 0.8; // Tuning frequency
        
        // Port calculations (assuming round port)
        const portDiameter = 5; // cm
        const portArea = Math.PI * (portDiameter / 2) ** 2;
        const portLength = (23562.5 * portArea) / (fb ** 2 * vb) - 0.732 * portDiameter;
        
        return { vb, fb, portDiameter, portLength: Math.max(portLength, 5) };
    }

    function calculateDimensions(volume) {
        // Golden ratio dimensions to avoid standing waves
        const ratio1 = 1;
        const ratio2 = 1.618;
        const ratio3 = 0.618;
        
        const totalRatio = ratio1 * ratio2 * ratio3;
        const scaleFactor = Math.cbrt(volume / totalRatio);
        
        return {
            width: (ratio1 * scaleFactor).toFixed(1),
            height: (ratio2 * scaleFactor).toFixed(1),
            depth: (ratio3 * scaleFactor).toFixed(1)
        };
    }

    function displayResults(calc, type) {
        const dims = calculateDimensions(calc.vb);
        
        // Update 3D visualization inputs
        boxWidthInput.value = dims.width;
        boxHeightInput.value = dims.height;
        boxDepthInput.value = dims.depth;
        updateBoxDimensions();
        
        let html = `<div class="result-section">
            <h3>Box Volume: ${calc.vb.toFixed(1)} liters</h3>
            <p><strong>Dimensions (W×H×D):</strong> ${dims.width} × ${dims.height} × ${dims.depth} cm</p>
        </div>`;

        if (type === 'sealed') {
            html += `<div class="result-section">
                <h3>Sealed Box Results</h3>
                <p><strong>Qtc:</strong> ${calc.qtc}</p>
                <p><strong>F3 (-3dB):</strong> ${calc.f3.toFixed(1)} Hz</p>
            </div>`;
        } else {
            html += `<div class="result-section">
                <h3>Ported Box Results</h3>
                <p><strong>Tuning Frequency:</strong> ${calc.fb.toFixed(1)} Hz</p>
                <p><strong>Port Diameter:</strong> ${calc.portDiameter} cm</p>
                <p><strong>Port Length:</strong> ${calc.portLength.toFixed(1)} cm</p>
            </div>`;
        }

        results.innerHTML = html;
    }

    function initThreeJS() {
        const container = document.getElementById('canvas-container');
        
        // Basic scene setup
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0xf0f0f0);
        
        // Camera
        camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
        camera.position.set(25, 20, 25);
        camera.lookAt(0, 0, 0);
        
        // Renderer
        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(container.clientWidth, container.clientHeight);
        container.appendChild(renderer.domElement);
        
        // Create initial speaker box
        updateBoxAndDxf();
        
        // Mouse rotation
        let mouseDown = false;
        let mouseX = 0, mouseY = 0;
        
        container.addEventListener('mousedown', (e) => {
            mouseDown = true;
            mouseX = e.clientX;
            mouseY = e.clientY;
        });
        
        container.addEventListener('mouseup', () => mouseDown = false);
        
        container.addEventListener('mousemove', (e) => {
            if (!mouseDown) return;
            
            const deltaX = e.clientX - mouseX;
            const deltaY = e.clientY - mouseY;
            
            speakerBox.rotation.y -= deltaX * 0.01; // Reversed for natural feel
            speakerBox.rotation.x += deltaY * 0.01;
            
            mouseX = e.clientX;
            mouseY = e.clientY;
        });
        
        // Mouse wheel zoom
        container.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomSpeed = 0.1;
            const direction = e.deltaY > 0 ? 1 : -1;
            
            camera.position.multiplyScalar(1 + direction * zoomSpeed);
            camera.lookAt(0, 0, 0);
        });
        
        // Start animation loop
        animate();
    }

    function updateVisualization(dims, type) {
        // We'll add this functionality step by step
        console.log('Update visualization called with:', dims, type);
    }

    function animate() {
        requestAnimationFrame(animate);
        renderer.render(scene, camera);
    }
});
