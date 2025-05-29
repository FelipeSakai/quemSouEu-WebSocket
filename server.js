// server.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const server = http.createServer((req, res) => {
  let filePath = path.join(__dirname, 'public', req.url === '/' ? 'login.html' : req.url);
  let extname = String(path.extname(filePath)).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css'
  };

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(500);
      res.end('Erro interno');
    } else {
      res.writeHead(200, { 'Content-Type': mimeTypes[extname] || 'application/octet-stream' });
      res.end(content, 'utf-8');
    }
  });
});

const wss = new WebSocket.Server({ server });

let players = [];
let gameState = {
  chosenPerson: '',
  attempts: 0,
  finished: false,
  waitingAnswer: false,
  gameStarted: false
};

function updatePlayerList() {
  const roles = ['chooser', 'asker'];
  roles.forEach(role => {
    const player = players.find(p => p.role === role);
    broadcast({ type: 'player-update', role, username: player ? player.username : null });
  });
}

wss.on('connection', ws => {
  ws.on('message', message => {
    const data = JSON.parse(message);

    if (data.type === 'role') {
      if (players.find(p => p.role === data.role && p.readyState === WebSocket.OPEN)) {
        ws.send(JSON.stringify({ type: 'error', message: `O papel "${data.role}" já foi escolhido por outro jogador.` }));
        ws.close();
        return;
      }

      ws.role = data.role;
      ws.username = data.username;
      players.push(ws);

      if (players.length > 2) {
        ws.send(JSON.stringify({ type: 'error', message: 'Jogo já com 2 jogadores.' }));
        ws.close();
        return;
      }

      updatePlayerList();
    }
    if (players.length === 2) {
      players.forEach(p => {
        if (p.readyState === WebSocket.OPEN) {
          p.send(JSON.stringify({ type: 'ready' }));
        }
      });
    }

    if (data.type === 'set-person') {
      if (gameState.gameStarted) return;
      gameState.chosenPerson = data.person;
      gameState.finished = false;
      gameState.attempts = 0;
      gameState.waitingAnswer = false;
      gameState.gameStarted = true;
      broadcast({ type: 'game-started' });
    }

    if (data.type === 'question') {
      if (!gameState.gameStarted || !gameState.chosenPerson) {
        ws.send(JSON.stringify({ type: 'error', message: 'Aguardando o outro jogador escolher a pessoa.' }));
        return;
      }
      if (gameState.waitingAnswer || gameState.finished) return;
      const chooser = players.find(p => p.role === 'chooser');
      if (chooser) {
        gameState.waitingAnswer = true;
        chooser.send(JSON.stringify({ type: 'question', question: data.question }));
      }
    }

    if (data.type === 'answer') {
      const asker = players.find(p => p.role === 'asker');
      if (asker) {
        gameState.waitingAnswer = false;
        asker.send(JSON.stringify({ type: 'answer', answer: data.answer }));
      }
    }

    if (data.type === 'guess') {
      if (!gameState.gameStarted || !gameState.chosenPerson || gameState.finished) {
        ws.send(JSON.stringify({ type: 'error', message: 'Você ainda não pode adivinhar.' }));
        return;
      }
      gameState.attempts++;
      const chooser = players.find(p => p.role === 'chooser');
      if (chooser) {
        chooser.send(JSON.stringify({ type: 'guess-attempt', guess: data.guess }));
      }
    }

    if (data.type === 'guess-response') {
      const asker = players.find(p => p.role === 'asker');
      if (asker) {
        const correct = data.correct === true;
        const guess = data.guess || '';
        gameState.finished = correct;
        asker.send(JSON.stringify({
          type: 'guess-result',
          correct,
          guess,
          attempts: gameState.attempts
        }));
        if (correct) {
          setTimeout(() => {
            broadcast({ type: 'restart-prompt' });
          }, 1000);
        }
      }
    }

    if (data.type === 'restart') {
      gameState = {
        chosenPerson: '',
        attempts: 0,
        finished: false,
        waitingAnswer: false,
        gameStarted: false
      };
      players.forEach(p => {
        if (p.readyState === WebSocket.OPEN) {
          p.send(JSON.stringify({ type: 'restart' }));
        }
      });
      updatePlayerList();
    }
  });

  ws.on('close', () => {
    players = players.filter(p => p !== ws);
    updatePlayerList();
    if (players.length < 2) gameState = {
      chosenPerson: '',
      attempts: 0,
      finished: false,
      waitingAnswer: false,
      gameStarted: false
    };
  });
});

function broadcast(message, exclude) {
  players.forEach(p => {
    if (p !== exclude && p.readyState === WebSocket.OPEN) {
      p.send(JSON.stringify(message));
    }
  });
}

const PORT = 3000;
server.listen(PORT, () => console.log(`Servidor rodando em http://localhost:${PORT}`));