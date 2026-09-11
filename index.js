const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static('public'));

// Base de todos os usuários cadastrados no sistema
let todosUsuariosCadastrados = {};
// Mapeamento de socketId para nickname
let socketsConectados = {};

io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);

  // Registro ou Reconexão de usuário
  socket.on('registrar-usuario', (dados) => {
    if (!dados || !dados.nick) return;

    const nickKey = dados.nick.toLowerCase();

    // Atualiza ou cria o registro do usuário na base geral
    todosUsuariosCadastrados[nickKey] = {
      nick: dados.nick,
      nome: dados.nome,
      idade: dados.idade,
      sexo: dados.sexo,
      foto: dados.foto || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=500&auto=format&fit=crop&q=80",
      bio: dados.bio || "",
      altura: dados.altura || "",
      procura: dados.procura || "Trocar uma ideia",
      status: 'online', // Ativo ao conectar
      socketId: socket.id,
      distKm: dados.distKm || (Math.random() * 4.5 + 0.1).toFixed(2)
    };

    socketsConectados[socket.id] = nickKey;

    // Emite a lista atualizada de todos os cadastrados para a galera
    io.emit('lista-usuarios-reais', Object.values(todosUsuariosCadastrados));
  });

  // Atualização de Status (Online / Ausente)
  socket.on('change-status', (novoStatus) => {
    const nickKey = socketsConectados[socket.id];
    if (nickKey && todosUsuariosCadastrados[nickKey]) {
      todosUsuariosCadastrados[nickKey].status = novoStatus;
      io.emit('lista-usuarios-reais', Object.values(todosUsuariosCadastrados));
    }
  });

  // Envio de mensagem privada
  socket.on('send-private-message', (data) => {
    const remetenteNickKey = socketsConectados[socket.id];
    const remetente = remetenteNickKey ? todosUsuariosCadastrados[remetenteNickKey] : null;

    const destNickKey = (data.paraNick || '').toLowerCase();
    const destinatario = todosUsuariosCadastrados[destNickKey];

    if (destinatario && destinatario.socketId) {
      io.to(destinatario.socketId).emit('receive-private-message', {
        deId: socket.id,
        deNick: remetente ? remetente.nick : data.deNick,
        deNome: remetente ? remetente.nome : 'Usuário',
        deFoto: remetente ? remetente.foto : '',
        texto: data.texto,
        tipo: data.tipo || 'texto',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
    }
  });

  // Ao desconectar, altera o status para offline em vez de deletar o cadastro
  socket.on('disconnect', () => {
    const nickKey = socketsConectados[socket.id];
    if (nickKey && todosUsuariosCadastrados[nickKey]) {
      todosUsuariosCadastrados[nickKey].status = 'offline';
      todosUsuariosCadastrados[nickKey].socketId = null;
    }
    delete socketsConectados[socket.id];
    io.emit('lista-usuarios-reais', Object.values(todosUsuariosCadastrados));
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor Colaê rodando na porta ${PORT}`));
