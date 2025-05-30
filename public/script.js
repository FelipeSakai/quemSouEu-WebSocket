const role = sessionStorage.getItem('role');
const username = sessionStorage.getItem('username');
const socket = new WebSocket(`ws://${location.host}`);
const historico = document.getElementById('historico');
let ultimaPergunta = '';
let perguntaBloqueada = false;
let jogoFinalizado = false;

socket.onopen = () => {
  socket.send(JSON.stringify({ type: 'role', role, username }));

  document.getElementById('titulo').innerText = `${username}, você entrou como ${role === 'chooser' ? 'quem escolhe' : 'quem pergunta'}`;

  if (role === 'chooser') {
    document.getElementById('chooser-box').style.display = 'block';
  } else if (role === 'asker') {
    document.getElementById('asker-box').style.display = 'none';
  }
};

socket.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if (data.type === 'game-started') {
    Swal.fire({
      title: 'Jogo Iniciado!',
      text: 'Agora você pode começar a jogar!',
      icon: 'success',
      confirmButtonText: 'Vamos lá!'
    });
    if (role === 'asker') {
      document.getElementById('asker-box').style.display = 'block';
    }
    document.body.style.backgroundColor = '#2d2d44';
    document.getElementById('titulo').style.color = '#4df9c3';
  }

  if (data.type === 'question' && role === 'chooser') {
    const div = document.getElementById('resposta');
    div.innerHTML = `
      <p>Pergunta: ${data.question}</p>
      <button onclick="responder('Sim')">Sim</button>
      <button onclick="responder('Não')">Não</button>
    `;
  }

  if (data.type === 'answer' && role === 'asker') {
    perguntaBloqueada = false;
    Swal.fire({
      title: 'Resposta recebida!',
      text: `Resposta: ${data.answer}`,
      icon: 'info',
      timer: 1500,
      showConfirmButton: false
    });
    document.getElementById('resposta').innerText = `Resposta: ${data.answer}`;
    historico.innerHTML += `<p><strong>Pergunta:</strong> ${ultimaPergunta} — <strong>Resposta:</strong> ${data.answer}</p>`;
  }

  if (data.type === 'guess-attempt' && role === 'chooser') {
    const div = document.getElementById('resposta');
    div.innerHTML = `
      <p>Palpite: ${data.guess}</p>
      <button onclick="responderPalpite(true, '${data.guess}')">Acertou</button>
      <button onclick="responderPalpite(false, '${data.guess}')">Errou</button>
    `;
  }

  if (data.type === 'guess-result' && role === 'asker') {
    if (data.correct) {
      jogoFinalizado = true;
      Swal.fire({
        title: 'Acertou!',
        text: `Tentativas: ${data.attempts}`,
        icon: 'success',
        confirmButtonText: 'OK'
      });
    } else {
      Swal.fire({
        title: 'Errou!',
        text: `Tentativas: ${data.attempts}`,
        icon: 'error',
        confirmButtonText: 'Continuar'
      });
    }
    document.getElementById('tentativas').innerText = `Tentativas: ${data.attempts}`;
  }

  if (data.type === 'restart-prompt') {
    Swal.fire({
      title: 'Fim de jogo!',
      text: 'Deseja jogar novamente?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sim',
      cancelButtonText: 'Não'
    }).then((result) => {
      if (result.isConfirmed) {
        socket.send(JSON.stringify({ type: 'restart' }));
      }
    });
  }

  if (data.type === 'restart') {
    perguntaBloqueada = false;
    jogoFinalizado = false;
    location.reload();
  }

  if (data.type === 'redirect-login') {
    sessionStorage.clear();
    Swal.fire({
      title: 'Nova rodada!',
      text: 'Você será redirecionado para escolher seu papel novamente.',
      icon: 'info',
      timer: 2000,
      showConfirmButton: false
    });
    setTimeout(() => {
      window.location.href = 'login.html';
    }, 2000);
  }

  if (data.type === 'error') {
    Swal.fire({
      title: 'Erro',
      text: data.message,
      icon: 'error',
      confirmButtonText: 'OK'
    });
  }
};

function setPerson() {
  const person = document.getElementById('person').value.trim();
  if (!person) {
    Swal.fire('Digite um nome!', '', 'warning');
    return;
  }
  socket.send(JSON.stringify({ type: 'set-person', person }));
}

function sendQuestion() {
  if (jogoFinalizado) {
    Swal.fire('O jogo acabou!', 'Espere pelo próximo round.', 'info');
    return;
  }
  if (perguntaBloqueada) {
    Swal.fire('Espere a resposta da pergunta anterior!', '', 'warning');
    return;
  }
  const question = document.getElementById('question').value.trim();
  if (!question) {
    Swal.fire('Digite uma pergunta!', '', 'warning');
    return;
  }
  ultimaPergunta = question;
  perguntaBloqueada = true;
  socket.send(JSON.stringify({ type: 'question', question }));
  document.getElementById('question').value = '';
}

function guess() {
  if (jogoFinalizado) {
    Swal.fire('O jogo acabou!', 'Espere pelo próximo round.', 'info');
    return;
  }
  Swal.fire({
    title: 'Seu palpite:',
    input: 'text',
    inputLabel: 'Quem você acha que é?',
    showCancelButton: true,
    confirmButtonText: 'Enviar',
    cancelButtonText: 'Cancelar',
    preConfirm: (guess) => {
      if (!guess) {
        Swal.showValidationMessage('Você precisa digitar um nome');
      }
      return guess;
    }
  }).then((result) => {
    if (result.isConfirmed) {
      socket.send(JSON.stringify({ type: 'guess', guess: result.value }));
    }
  });
}

function responder(resposta) {
  socket.send(JSON.stringify({ type: 'answer', answer: resposta }));
  document.getElementById('resposta').innerHTML = '';
}

function responderPalpite(correto, guess) {
  socket.send(JSON.stringify({ type: 'guess-response', correct: correto, guess }));
  document.getElementById('resposta').innerHTML = '';
}
