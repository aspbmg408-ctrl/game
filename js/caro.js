const SIZE = 15;
let board = [];
let isGameOver = false;
let isPlayerTurn = true;
let gameMode = 'EASY';

// Các mức điểm đánh giá Heuristic
const SCORES = {
    WIN: 10000000,
    ALIVE_4: 1000000,
    DEAD_4: 10000,
    ALIVE_3: 10000,
    DEAD_3: 100,
    ALIVE_2: 100,
    DEAD_2: 10
};

// Khởi tạo DOM
const boardDOM = document.getElementById('board');
const menuScreen = document.getElementById('menu-screen');
const gameScreen = document.getElementById('game-screen');
const turnIndicator = document.getElementById('turn-indicator');
const logContent = document.getElementById('log-content');
const btnRestart = document.getElementById('btn-restart');

// m Thanh
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    
    if (type === 'x') { // Tiếng cạch của X
        osc.type = 'triangle'; osc.frequency.setValueAtTime(300, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime); gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.1);
        osc.start(); osc.stop(audioCtx.currentTime + 0.1);
    } else if (type === 'o') { // Tiếng bíp của Bot
        osc.type = 'sine'; osc.frequency.setValueAtTime(600, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime); gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.15);
        osc.start(); osc.stop(audioCtx.currentTime + 0.15);
    } else if (type === 'win') {
        osc.type = 'square'; osc.frequency.setValueAtTime(400, audioCtx.currentTime);
        osc.frequency.setValueAtTime(600, audioCtx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime); gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.6);
        osc.start(); osc.stop(audioCtx.currentTime + 0.6);
    }
}

// ----------------------------------------------------
// 1. GAME LOGIC CƠ BẢN
// ----------------------------------------------------
function startGame(mode) {
    gameMode = mode;
    menuScreen.style.display = 'none'; gameScreen.style.display = 'block';
    resetGame();
}

function resetGame() {
    board = Array(SIZE).fill(null).map(() => Array(SIZE).fill(0)); // 0: Trống, 1: X (Player), 2: O (Bot)
    isGameOver = false; isPlayerTurn = true; logContent.innerHTML = '';
    turnIndicator.innerText = "LƯỢT CỦA BẠN (❌)"; turnIndicator.style.background = "#e11d48";
    
    boardDOM.innerHTML = '';
    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            let cell = document.createElement('div');
            cell.className = 'cell'; cell.dataset.r = r; cell.dataset.c = c;
            cell.addEventListener('click', () => playerMove(r, c));
            boardDOM.appendChild(cell);
        }
    }
    addLog('system', "Trận đấu bắt đầu! Bạn cầm quân X đi trước.");
}

btnRestart.addEventListener('click', resetGame);

function addLog(who, msg) {
    const p = document.createElement('div');
    if (who === 'player') { p.className = 'log-p'; p.innerText = `❌ Bạn: ${msg}`; }
    else if (who === 'bot') { p.className = 'log-b'; p.innerText = `⭕ AI: ${msg}`; }
    else { p.className = 'log-danger'; p.innerText = msg; }
    logContent.appendChild(p); logContent.scrollTop = logContent.scrollHeight;
}

function playerMove(r, c) {
    if (isGameOver || !isPlayerTurn || board[r][c] !== 0) return;
    
    // Đánh X
    board[r][c] = 1; drawMove(r, c, 1); playSound('x');
    addLog('player', `Đánh tại (${r}, ${c})`);
    
    if (checkWin(r, c, 1)) return processWin(1, r, c);

    isPlayerTurn = false;
    turnIndicator.innerText = "AI ĐANG TÍNH TOÁN..."; turnIndicator.style.background = "#0284c7";
    
    // Tạo độ trễ giả lập Bot đang suy nghĩ
    setTimeout(botMove, 500); 
}

function drawMove(r, c, player) {
    let cellDOM = document.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
    if(player === 1) { cellDOM.innerText = 'X'; cellDOM.classList.add('x'); }
    else { cellDOM.innerText = 'O'; cellDOM.classList.add('o'); }
}

// ----------------------------------------------------
// 2. THUẬT TOÁN ĐẠI KIỆN TƯỚNG (HEURISTIC BOT AI)
// ----------------------------------------------------
function botMove() {
    if (isGameOver) return;
    let bestR = -1; let bestC = -1; let maxScore = -1;
    
    // Mảng lưu các nước đi có điểm cao bằng nhau (để chọn ngẫu nhiên trong đám đó)
    let bestMoves = []; 

    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            if (board[r][c] === 0) {
                // TÍNH ĐIỂM: Điểm tấn công của Bot (đặt O) + Điểm phòng thủ (chặn X)
                let attackScore = evaluateCell(r, c, 2);
                let defenseScore = evaluateCell(r, c, 1);
                
                // Ở chế độ EASY, Bot đánh hơi ngáo (giảm bớt điểm phòng ngự)
                if (gameMode === 'EASY') defenseScore = defenseScore * 0.5;

                // Nếu Bot đang có cơ hội tạo 5 (Win) -> Phải ưu tiên Tấn công tuyệt đối
                if (attackScore >= SCORES.WIN) defenseScore = 0;

                let totalScore = attackScore + defenseScore;

                if (totalScore > maxScore) {
                    maxScore = totalScore;
                    bestMoves = [{r, c, attackScore, defenseScore}];
                } else if (totalScore === maxScore) {
                    bestMoves.push({r, c, attackScore, defenseScore});
                }
            }
        }
    }

    // Nếu bàn cờ trống trơn, đánh vào giữa
    if (maxScore === 0) { bestR = 7; bestC = 7; }
    else {
        // Random trong các nước đi tối ưu để tránh AI đánh 100 ván như 1
        let pick = bestMoves[Math.floor(Math.random() * bestMoves.length)];
        bestR = pick.r; bestC = pick.c;
        
        let msg = `Đánh tại (${bestR}, ${bestC})`;
        if (pick.defenseScore >= SCORES.ALIVE_4) msg += " (Chặn đòn chí mạng!)";
        else if (pick.attackScore >= SCORES.ALIVE_4) msg += " (Chuẩn bị kết liễu!)";
        addLog('bot', msg);
    }

    // Bot chốt hạ
    board[bestR][bestC] = 2; drawMove(bestR, bestC, 2); playSound('o');
    
    if (checkWin(bestR, bestC, 2)) return processWin(2, bestR, bestC);

    isPlayerTurn = true;
    turnIndicator.innerText = "LƯỢT CỦA BẠN (❌)"; turnIndicator.style.background = "#e11d48";
}

// Hàm cốt lõi: Đánh giá điểm số của 1 ô cụ thể nếu player đặt vào đó
function evaluateCell(r, c, player) {
    let score = 0;
    const dirs = [ [1,0], [0,1], [1,1], [1,-1] ]; // Dọc, Ngang, Chéo chính, Chéo phụ

    for (let i = 0; i < dirs.length; i++) {
        let dr = dirs[i][0]; let dc = dirs[i][1];
        let consecutive = 1; let blocks = 0;

        // Quét tới
        let iForward = 1;
        while (true) {
            let nr = r + dr * iForward; let nc = c + dc * iForward;
            if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) { blocks++; break; } // Đụng tường
            if (board[nr][nc] === player) { consecutive++; iForward++; }
            else if (board[nr][nc] !== 0) { blocks++; break; } // Bị chặn bởi địch
            else { break; } // Trống
        }

        // Quét lùi
        let iBackward = 1;
        while (true) {
            let nr = r - dr * iBackward; let nc = c - dc * iBackward;
            if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) { blocks++; break; } // Đụng tường
            if (board[nr][nc] === player) { consecutive++; iBackward++; }
            else if (board[nr][nc] !== 0) { blocks++; break; } // Bị chặn bởi địch
            else { break; } // Trống
        }

        // Dựa vào số quân liên tiếp và số đầu bị chặn để chấm điểm
        if (consecutive >= 5) score += SCORES.WIN;
        else if (consecutive === 4) {
            if (blocks === 0) score += SCORES.ALIVE_4;
            else if (blocks === 1) score += SCORES.DEAD_4;
        }
        else if (consecutive === 3) {
            if (blocks === 0) score += SCORES.ALIVE_3;
            else if (blocks === 1) score += SCORES.DEAD_3;
        }
        else if (consecutive === 2) {
            if (blocks === 0) score += SCORES.ALIVE_2;
            else if (blocks === 1) score += SCORES.DEAD_2;
        }
    }
    return score;
}

// ----------------------------------------------------
// 3. KIỂM TRA THẮNG THUA
// ----------------------------------------------------
function checkWin(r, c, player) {
    const dirs = [ [1,0], [0,1], [1,1], [1,-1] ];
    let winCells = [];

    for (let i = 0; i < dirs.length; i++) {
        let dr = dirs[i][0]; let dc = dirs[i][1];
        let consecutive = 1; let tempCells = [{r, c}];

        let iForward = 1;
        while (true) {
            let nr = r + dr * iForward; let nc = c + dc * iForward;
            if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && board[nr][nc] === player) {
                consecutive++; tempCells.push({r: nr, c: nc}); iForward++;
            } else break;
        }

        let iBackward = 1;
        while (true) {
            let nr = r - dr * iBackward; let nc = c - dc * iBackward;
            if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && board[nr][nc] === player) {
                consecutive++; tempCells.push({r: nr, c: nc}); iBackward++;
            } else break;
        }

        if (consecutive >= 5) {
            winCells = tempCells;
            break; 
        }
    }
    return winCells.length >= 5 ? winCells : false;
}

function processWin(player, r, c) {
    isGameOver = true; playSound('win');
    let winLine = checkWin(r, c, player);
    
    // Tô vàng đường thắng
    if(winLine) {
        winLine.forEach(cell => {
            document.querySelector(`.cell[data-r="${cell.r}"][data-c="${cell.c}"]`).classList.add('win-cell');
        });
    }

    if (player === 1) {
        turnIndicator.innerText = "BẠN ĐÃ CHIẾN THẮNG!"; turnIndicator.style.background = "#10b981";
        addLog('system', "KẾT THÚC: BẠN ĐÃ THẮNG!");
        localStorage.setItem('caro_win', (parseInt(localStorage.getItem('caro_win')) || 0) + 1);
    } else {
        turnIndicator.innerText = "AI ĐÃ CHIẾN THẮNG!"; turnIndicator.style.background = "#f59e0b";
        addLog('system', "KẾT THÚC: AI ĐÃ THẮNG!");
        localStorage.setItem('caro_lose', (parseInt(localStorage.getItem('caro_lose')) || 0) + 1);
    }
}