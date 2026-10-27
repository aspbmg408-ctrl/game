const SIZE = 10;
const SHIP_TYPES = [
    { id: 'ship-5', len: 5, name: 'Tàu Sân Bay' },
    { id: 'ship-4', len: 4, name: 'Thiết Giáp Hạm' },
    { id: 'ship-3', len: 3, name: 'Tuần Dương Hạm' },
    { id: 'ship-2', len: 3, name: 'Tàu Ngầm' },
    { id: 'ship-1', len: 2, name: 'Tàu Khu Trục' }
];

let playerGrid = []; let enemyGrid = [];
let playerShipsAlive = 5; let enemyShipsAlive = 5;
let isGameStarted = false; let isPlayerTurn = false;
let gameMode = 'NORMAL';

// Bot Variables
let botState = 'HUNT';
let botTargetQueue = [];
let botFirstHit = null;
let botLastHit = null;
let enemyShipsData = []; // Lưu tọa độ từng tàu địch để biết chìm tàu nào

// DOM
const pBoardDOM = document.getElementById('player-board');
const eBoardDOM = document.getElementById('enemy-board');
const menuScreen = document.getElementById('menu-screen');
const gameScreen = document.getElementById('game-screen');
const btnStart = document.getElementById('btn-start-battle');
const btnRestart = document.getElementById('btn-restart');
const turnIndicator = document.getElementById('turn-indicator');
const logContent = document.getElementById('log-content');
const uiEnemyLeft = document.getElementById('enemy-ships-left');
const uiPlayerLeft = document.getElementById('player-ships-left');

// Âm thanh
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    if (type === 'hit') {
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(100, now);
        osc.frequency.exponentialRampToValueAtTime(10, now + 0.6);
        gain.gain.setValueAtTime(0.5, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
        osc.start(now); osc.stop(now + 0.6);
    } else if (type === 'miss') {
        osc.type = 'sine'; osc.frequency.setValueAtTime(500, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.3);
        gain.gain.setValueAtTime(0.2, now); gain.gain.linearRampToValueAtTime(0, now + 0.3);
        osc.start(now); osc.stop(now + 0.3);
    }
}

// Convert Tọa độ (0,0 -> A1)
function getCoordString(r, c) {
    const letters = ['A','B','C','D','E','F','G','H','I','J'];
    return letters[r] + (c + 1);
}
function addLog(isPlayer, r, c, isHit, msg = "") {
    const p = document.createElement('div');
    p.className = isPlayer ? 'log-p' : 'log-e';
    if(isHit) p.classList.add('log-hit');
    const who = isPlayer ? "Bạn" : "Địch";
    const result = isHit ? "TRÚNG MỤC TIÊU 💥" : "Trượt 💦";
    p.innerText = `[${getCoordString(r, c)}] ${who} bắn: ${result} ${msg}`;
    logContent.appendChild(p);
    logContent.scrollTop = logContent.scrollHeight; // Auto scroll
}

// ---------------------------------------------------------
// 1. KHỞI TẠO VÀ XẾP TÀU (CÓ THỂ DI CHUYỂN & XOAY)
// ---------------------------------------------------------
function initSetup(mode) {
    gameMode = mode;
    menuScreen.style.display = 'none'; gameScreen.style.display = 'block'; btnRestart.style.display = 'block';
    
    playerGrid = Array(SIZE).fill(null).map(() => Array(SIZE).fill(0));
    enemyGrid = Array(SIZE).fill(null).map(() => Array(SIZE).fill(0));
    playerShipsAlive = 5; enemyShipsAlive = 5;
    isGameStarted = false; botState = 'HUNT'; botTargetQueue = []; logContent.innerHTML = '';
    uiEnemyLeft.innerText = 5; uiPlayerLeft.innerText = 5;
    
    pBoardDOM.innerHTML = ''; eBoardDOM.innerHTML = '';
    
    // Đưa tàu về bến
    document.querySelectorAll('.ship-drag').forEach(ship => {
        document.querySelector('.dock-container').appendChild(ship);
        ship.classList.remove('ship-placed');
        ship.style.top = ''; ship.style.left = '';
        ship.dataset.dir = "0"; // Reset nằm ngang
    });
    btnStart.disabled = true; document.getElementById('ship-dock').style.display = 'block';

    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            let pCell = document.createElement('div'); pCell.className = 'cell'; 
            pCell.dataset.r = r; pCell.dataset.c = c; pBoardDOM.appendChild(pCell);

            let eCell = document.createElement('div'); eCell.className = 'cell'; eCell.id = `e-${r}-${c}`;
            eCell.addEventListener('click', () => playerShoot(r, c));
            eBoardDOM.appendChild(eCell);
        }
    }
    setupDragAndDrop();
    turnIndicator.innerText = `Chế độ: ${mode === 'HARD' ? 'Toán học (Khó)' : 'Bình thường'}`;
    turnIndicator.style.background = mode === 'HARD' ? '#be123c' : '#059669';
}

btnRestart.addEventListener('click', () => initSetup(gameMode));

// --- KÉO THẢ NÂNG CẤP ---
let draggedShip = null;
let originCells = []; // Lưu vị trí cũ để xóa nếu di chuyển
let originDir = 0;

function setupDragAndDrop() {
    const ships = document.querySelectorAll('.ship-drag');
    const cells = document.querySelectorAll('#player-board .cell');

    ships.forEach(ship => {
        // NÂNG CẤP 1: Click để Xoay (Kể cả khi đã đặt trên bàn)
        ship.onclick = (e) => {
            if(isGameStarted) return;
            let len = parseInt(ship.dataset.len);
            let dir = parseInt(ship.dataset.dir);
            let newDir = dir === 0 ? 1 : 0;
            
            if (ship.classList.contains('ship-placed')) {
                // Đang trên bàn -> Kiểm tra xem xoay có vướng không
                let r = parseInt(ship.dataset.r); let c = parseInt(ship.dataset.c);
                // Xóa tạm tàu cũ khỏi lưới
                for(let i=0; i<len; i++) playerGrid[dir===1 ? r+i : r][dir===0 ? c+i : c] = 0;
                
                // Ktra xoay
                let canRotate = true;
                for(let i=0; i<len; i++) {
                    let nr = newDir===1 ? r+i : r; let nc = newDir===0 ? c+i : c;
                    if(nr>=SIZE || nc>=SIZE || playerGrid[nr][nc]===1) canRotate = false;
                }
                
                if(canRotate) {
                    ship.dataset.dir = newDir;
                    for(let i=0; i<len; i++) playerGrid[newDir===1 ? r+i : r][newDir===0 ? c+i : c] = 1;
                } else {
                    // Trả lại lưới nếu k xoay được
                    for(let i=0; i<len; i++) playerGrid[dir===1 ? r+i : r][dir===0 ? c+i : c] = 1;
                    // Báo lỗi chớp đỏ
                    ship.style.borderColor = 'red'; setTimeout(()=> ship.style.borderColor = '', 200);
                }
            } else {
                ship.dataset.dir = newDir; // Ở bến thì cứ xoay
            }
        };

        // NÂNG CẤP 2: Kéo tàu đã đặt đi chỗ khác
        ship.ondragstart = (e) => {
            if(isGameStarted) return e.preventDefault();
            draggedShip = ship;
            originDir = parseInt(ship.dataset.dir);
            if (ship.classList.contains('ship-placed')) {
                // Nhấc lên -> Xóa data cũ
                let r = parseInt(ship.dataset.r); let c = parseInt(ship.dataset.c);
                let len = parseInt(ship.dataset.len);
                originCells = [];
                for(let i=0; i<len; i++) {
                    let nr = originDir===1 ? r+i : r; let nc = originDir===0 ? c+i : c;
                    playerGrid[nr][nc] = 0; 
                    originCells.push({r: nr, c: nc});
                }
            } else { originCells = []; }
            setTimeout(() => ship.style.opacity = '0.5', 0);
        };
        ship.ondragend = () => {
            draggedShip.style.opacity = '1'; clearHighlights();
            // Nếu thả sai (không vào cell), trả lại data cũ
            if(draggedShip && originCells.length > 0 && draggedShip.style.opacity === '1') {
                originCells.forEach(cell => playerGrid[cell.r][cell.c] = 1);
            }
        };
    });

    cells.forEach(cell => {
        cell.ondragover = (e) => { e.preventDefault(); highlightCells(cell); };
        cell.ondragleave = clearHighlights;
        cell.ondrop = (e) => { e.preventDefault(); dropShip(cell); };
    });
}

function highlightCells(targetCell) {
    clearHighlights();
    if (!draggedShip) return;
    let r = parseInt(targetCell.dataset.r); let c = parseInt(targetCell.dataset.c);
    let len = parseInt(draggedShip.dataset.len); let dir = parseInt(draggedShip.dataset.dir);
    let isValid = true; let cellsToHighlight = [];

    for (let i = 0; i < len; i++) {
        let nr = dir === 1 ? r + i : r; let nc = dir === 0 ? c + i : c;
        if (nr >= SIZE || nc >= SIZE || playerGrid[nr][nc] === 1) { isValid = false; break; }
        cellsToHighlight.push(document.querySelector(`#player-board .cell[data-r="${nr}"][data-c="${nc}"]`));
    }
    cellsToHighlight.forEach(cell => { if(cell) cell.classList.add(isValid ? 'drag-valid' : 'drag-invalid'); });
}

function clearHighlights() {
    document.querySelectorAll('#player-board .cell').forEach(c => c.classList.remove('drag-valid', 'drag-invalid'));
}

function dropShip(targetCell) {
    if (!draggedShip) return;
    let r = parseInt(targetCell.dataset.r); let c = parseInt(targetCell.dataset.c);
    let len = parseInt(draggedShip.dataset.len); let dir = parseInt(draggedShip.dataset.dir);
    
    let isValid = true;
    for (let i = 0; i < len; i++) {
        let nr = dir === 1 ? r + i : r; let nc = dir === 0 ? c + i : c;
        if (nr >= SIZE || nc >= SIZE || playerGrid[nr][nc] === 1) isValid = false;
    }

    if (isValid) {
        for (let i = 0; i < len; i++) playerGrid[dir===1 ? r+i : r][dir===0 ? c+i : c] = 1;
        
        draggedShip.classList.add('ship-placed');
        draggedShip.dataset.r = r; draggedShip.dataset.c = c;
        draggedShip.style.top = `${r * 37}px`; draggedShip.style.left = `${c * 37}px`;
        pBoardDOM.appendChild(draggedShip);
        originCells = []; // Xóa lịch sử vị trí cũ vì đã đặt thành công
        checkAllShipsPlaced();
    } else {
        // Khôi phục lưới nếu thả hụt
        originCells.forEach(cell => playerGrid[cell.r][cell.c] = 1);
    }
    clearHighlights(); draggedShip = null;
}

function checkAllShipsPlaced() {
    let placed = document.querySelectorAll('.ship-placed').length;
    if(placed === 5) btnStart.disabled = false;
}

document.getElementById('btn-auto-place').onclick = () => {
    playerGrid = Array(SIZE).fill(null).map(() => Array(SIZE).fill(0));
    document.querySelectorAll('.ship-drag').forEach(ship => {
        let len = parseInt(ship.dataset.len); let placed = false;
        while (!placed) {
            let dir = Math.random() < 0.5 ? 0 : 1;
            let r = Math.floor(Math.random() * SIZE); let c = Math.floor(Math.random() * SIZE);
            let isValid = true;
            for (let i = 0; i < len; i++) {
                let nr = dir===1 ? r+i : r; let nc = dir===0 ? c+i : c;
                if(nr>=SIZE || nc>=SIZE || playerGrid[nr][nc]===1) isValid = false;
            }
            if (isValid) {
                for (let i=0; i<len; i++) playerGrid[dir===1 ? r+i : r][dir===0 ? c+i : c] = 1;
                ship.dataset.dir = dir; ship.dataset.r = r; ship.dataset.c = c;
                ship.classList.add('ship-placed');
                ship.style.top = `${r * 37}px`; ship.style.left = `${c * 37}px`;
                pBoardDOM.appendChild(ship); placed = true;
            }
        }
    });
    btnStart.disabled = false;
};

// ---------------------------------------------------------
// 2. VÀO TRẬN VÀ XỬ LÝ AI
// ---------------------------------------------------------
btnStart.onclick = () => {
    isGameStarted = true; isPlayerTurn = true;
    document.getElementById('ship-dock').style.display = 'none';
    eBoardDOM.classList.remove('disabled-board');
    
    // Tạo tàu địch và lưu lại object để biết bắn chìm tàu nào
    enemyGrid = Array(SIZE).fill(null).map(() => Array(SIZE).fill(0));
    enemyShipsData = [];
    SHIP_TYPES.forEach(stype => {
        let placed = false;
        while (!placed) {
            let dir = Math.random() < 0.5 ? 0 : 1;
            let r = Math.floor(Math.random() * SIZE); let c = Math.floor(Math.random() * SIZE);
            let isValid = true;
            for (let i=0; i<stype.len; i++) {
                let nr = dir===1 ? r+i : r; let nc = dir===0 ? c+i : c;
                if(nr>=SIZE || nc>=SIZE || enemyGrid[nr][nc] !== 0) isValid = false;
            }
            if (isValid) {
                let cells = [];
                for (let i=0; i<stype.len; i++) {
                    let nr = dir===1 ? r+i : r; let nc = dir===0 ? c+i : c;
                    enemyGrid[nr][nc] = stype.id; // Gắn ID tàu vào grid thay vì số 1
                    cells.push({r: nr, c: nc});
                }
                enemyShipsData.push({ id: stype.id, name: stype.name, cells: cells, hits: 0, len: stype.len });
                placed = true;
            }
        }
    });
    
    turnIndicator.innerText = "CHỈ HUY! HÃY BẮN!";
    turnIndicator.style.background = "#10b981";
    addLog(false, 0, 0, false, "Trận chiến bắt đầu!");
};

function playerShoot(r, c) {
    if (!isGameStarted || !isPlayerTurn) return;
    if (enemyGrid[r][c] === 'miss' || enemyGrid[r][c] === 'hit') return;

    let cellDOM = document.getElementById(`e-${r}-${c}`);
    let cellData = enemyGrid[r][c];

    if (cellData !== 0) { // BẮN TRÚNG
        playSound('hit'); enemyGrid[r][c] = 'hit'; cellDOM.classList.add('hit');
        
        // Kiểm tra xem tàu nào bị trúng
        let shipHit = enemyShipsData.find(s => s.id === cellData);
        shipHit.hits++;
        let msg = "";
        if(shipHit.hits === shipHit.len) {
            enemyShipsAlive--; uiEnemyLeft.innerText = enemyShipsAlive;
            msg = `-> ĐÃ CHÌM ${shipHit.name.toUpperCase()}! ☠️`;
        }
        addLog(true, r, c, true, msg);
        
        if (enemyShipsAlive === 0) { endGame("BẠN ĐÃ THẮNG CHIẾN DỊCH!"); return; }
    } else { // TRƯỢT
        playSound('miss'); enemyGrid[r][c] = 'miss'; cellDOM.classList.add('miss');
        addLog(true, r, c, false);
        isPlayerTurn = false;
        turnIndicator.innerText = "KẺ ĐỊCH ĐANG BẮN..."; turnIndicator.style.background = "#ef4444";
        setTimeout(botShoot, 800); 
    }
}

// ==========================================
// THUẬT TOÁN AI BẮN TÀU (BATTLESHIP BOT)
// ==========================================
function botShoot() {
    if (!isGameStarted || enemyShipsAlive === 0) return;
    let r, c;

    if (botState === 'TARGET' || botState === 'DESTROY') {
        if (botTargetQueue.length > 0) {
            let target = botTargetQueue.shift(); r = target.r; c = target.c;
            if (playerGrid[r][c] === 'miss' || playerGrid[r][c] === 'hit') { botShoot(); return; }
        } else {
            botState = 'HUNT'; botFirstHit = null; botShoot(); return;
        }
    } 
    else { // HUNT MODE
        if (gameMode === 'HARD') {
            // MARK ROBER ALGORITHM: PROBABILITY HEATMAP
            let heatmap = Array(SIZE).fill(null).map(() => Array(SIZE).fill(0));
            let aliveShipLengths = [5, 4, 3, 3, 2]; // Giả định đơn giản: Bot tìm chỗ nhét tàu
            
            for (let len of aliveShipLengths) {
                // Quét ngang
                for (let i = 0; i < SIZE; i++) {
                    for (let j = 0; j <= SIZE - len; j++) {
                        let canFit = true;
                        for(let k=0; k<len; k++) if (playerGrid[i][j+k] === 'miss' || playerGrid[i][j+k] === 'hit') canFit = false;
                        if (canFit) for(let k=0; k<len; k++) heatmap[i][j+k]++;
                    }
                }
                // Quét dọc
                for (let j = 0; j < SIZE; j++) {
                    for (let i = 0; i <= SIZE - len; i++) {
                        let canFit = true;
                        for(let k=0; k<len; k++) if (playerGrid[i+k][j] === 'miss' || playerGrid[i+k][j] === 'hit') canFit = false;
                        if (canFit) for(let k=0; k<len; k++) heatmap[i+k][j]++;
                    }
                }
            }
            // Tìm ô có điểm heatmap cao nhất và phải thuộc ô chẵn (Parity)
            let maxScore = -1; let bestTargets = [];
            for (let i=0; i<SIZE; i++) {
                for (let j=0; j<SIZE; j++) {
                    if (playerGrid[i][j] !== 'miss' && playerGrid[i][j] !== 'hit' && (i+j)%2 === 0) {
                        if (heatmap[i][j] > maxScore) { maxScore = heatmap[i][j]; bestTargets = [{r: i, c: j}]; }
                        else if (heatmap[i][j] === maxScore) { bestTargets.push({r: i, c: j}); }
                    }
                }
            }
            // Nếu không còn ô chẵn nào thì lấy max toàn bộ
            if (bestTargets.length === 0) {
                 maxScore = -1;
                 for (let i=0; i<SIZE; i++) for (let j=0; j<SIZE; j++) {
                    if (playerGrid[i][j] !== 'miss' && playerGrid[i][j] !== 'hit') {
                        if (heatmap[i][j] > maxScore) { maxScore = heatmap[i][j]; bestTargets = [{r: i, c: j}]; }
                        else if (heatmap[i][j] === maxScore) { bestTargets.push({r: i, c: j}); }
                    }
                 }
            }
            let pick = bestTargets[Math.floor(Math.random() * bestTargets.length)]; r = pick.r; c = pick.c;
            
        } else {
            // NORMAL MODE: Hunt random Parity
            let validTargets = [];
            for (let i=0; i<SIZE; i++) for (let j=0; j<SIZE; j++) {
                if (playerGrid[i][j] !== 'miss' && playerGrid[i][j] !== 'hit' && (i+j)%2===0) validTargets.push({r: i, c: j});
            }
            if (validTargets.length === 0) {
                for (let i=0; i<SIZE; i++) for (let j=0; j<SIZE; j++) if (playerGrid[i][j] !== 'miss' && playerGrid[i][j] !== 'hit') validTargets.push({r: i, c: j});
            }
            let pick = validTargets[Math.floor(Math.random() * validTargets.length)]; r = pick.r; c = pick.c;
        }
    }

    // THỰC THI BẮN
    let cellDOM = document.querySelector(`#player-board .cell[data-r="${r}"][data-c="${c}"]`);
    
    if (playerGrid[r][c] === 1) { // TRÚNG
        playSound('hit'); playerGrid[r][c] = 'hit';
        cellDOM.classList.add('hit'); // SỬA LỖI Ở ĐÂY: Dùng classList thay vì appendChild
        
        // Kiểm tra xem tàu nào bị chìm... (Đoạn này giữ nguyên)
        let msg = "";
        document.querySelectorAll('.ship-placed').forEach(ship => {
            let sr = parseInt(ship.dataset.r); let sc = parseInt(ship.dataset.c);
            let dir = parseInt(ship.dataset.dir); let len = parseInt(ship.dataset.len);
            let isSunk = true;
            for(let i=0; i<len; i++) {
                let nr = dir===1 ? sr+i : sr; let nc = dir===0 ? sc+i : sc;
                if(playerGrid[nr][nc] !== 'hit') isSunk = false;
            }
            if(isSunk && !ship.classList.contains('sunk')) {
                ship.classList.add('sunk'); ship.style.filter = 'brightness(0.3) sepia(1) hue-rotate(-50deg) saturate(5)';
                playerShipsAlive--; uiPlayerLeft.innerText = playerShipsAlive;
                msg = `-> TÀU ${ship.dataset.type.toUpperCase()} CỦA BẠN ĐÃ CHÌM! 🚨`;
                botState = 'HUNT'; botTargetQueue = []; 
            }
        });

        addLog(false, r, c, true, msg);
        
        // --- ĐOẠN CODE ĐÃ SỬA LỖI (BỎ VỎ BỌC IF SAI) ---
        if (botState === 'HUNT' || botTargetQueue.length === 0) {
            // Đang đi dò mà trúng -> Chuyển sang ngắm 4 ô xung quanh
            botState = 'TARGET'; 
            botFirstHit = {r, c}; 
            addAdjacentTargets(r, c);
        } else if (botState === 'TARGET') {
            // Trúng phát thứ 2 -> Xác định trục ngang/dọc, bỏ qua các ô rác
            botState = 'DESTROY'; 
            botLastHit = {r, c}; 
            refineTargets(r, c); 
            addAdjacentTargets(r, c);
        } else if (botState === 'DESTROY') { 
            // Tiếp tục càn quét dọc theo trục
            addAdjacentTargets(r, c); 
        }
        // ------------------------------------------------

        if (playerShipsAlive === 0) { endGame("HẠM ĐỘI CỦA BẠN ĐÃ BỊ HỦY DIỆT!"); return; }
        setTimeout(botShoot, 800);
    } else { // TRƯỢT
        playSound('miss'); playerGrid[r][c] = 'miss';
        cellDOM.classList.add('miss'); // SỬA LỖI Ở ĐÂY: Dùng classList thay vì appendChild
        
        addLog(false, r, c, false);
        isPlayerTurn = true;
        turnIndicator.innerText = "CHỈ HUY! HÃY BẮN!"; turnIndicator.style.background = "#10b981";
    }
}

function addAdjacentTargets(r, c) {
    const dirs = [[-1,0], [1,0], [0,-1], [0,1]];
    for (let [dr, dc] of dirs) {
        let nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && playerGrid[nr][nc] !== 'miss' && playerGrid[nr][nc] !== 'hit') {
            botTargetQueue.unshift({r: nr, c: nc}); 
        }
    }
}

function refineTargets(currR, currC) {
    let dr = currR - botFirstHit.r; let dc = currC - botFirstHit.c;
    botTargetQueue = botTargetQueue.filter(t => { return dr !== 0 ? t.c === botFirstHit.c : t.r === botFirstHit.r; });
}

function endGame(msg) {
    isGameStarted = false; turnIndicator.innerText = msg; turnIndicator.style.background = "#f59e0b";
    eBoardDOM.classList.add('disabled-board');

    // LOGIC MỚI: LƯU KẾT QUẢ VÀO LOCALSTORAGE
    if (msg.includes('BẠN ĐÃ THẮNG')) {
        localStorage.setItem('ship_win', (parseInt(localStorage.getItem('ship_win')) || 0) + 1);
    } else if (msg.includes('MÁY TÍNH ĐÃ THẮNG') || msg.includes('BỊ HỦY DIỆT')) {
        localStorage.setItem('ship_lose', (parseInt(localStorage.getItem('ship_lose')) || 0) + 1);
    }
}