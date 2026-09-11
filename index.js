const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static('public'));

// Base global de usuários cadastrados no servidor
let baseUsuarios = {};

io.on('connection', (socket) => {
  console.log('Novo cliente conectado:', socket.id);

  // Envia a lista existente assim que o celular conecta
  socket.emit('lista-usuarios-reais', Object.values(baseUsuarios));

  // Registrar ou atualizar conta na base global
  socket.on('registrar-usuario', (dados) => {
    if (!dados || !dados.nick) return;

    const nickKey = dados.nick.toLowerCase();

    baseUsuarios[nickKey] = {
      nick: dados.nick,
      nome: dados.nome,
      idade: dados.idade,
      sexo: dados.sexo,
      foto: dados.foto || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=500&auto=format&fit=crop&q=80",
      bio: dados.bio || "",
      altura: dados.altura || "",
      procura: dados.procura || "Trocar uma ideia",
      status: 'online',
      socketId: socket.id,
      distKm: dados.distKm || (Math.random() * 4.5 + 0.1).toFixed(2)
    };

    socket.nickKey = nickKey;

    // Notifica todos os usuários conectados sobre a lista atualizada
    io.emit('lista-usuarios-reais', Object.values(baseUsuarios));
  });

  // Atualização de Status (Online / Ausente)
  socket.on('change-status', (novoStatus) => {
    if (socket.nickKey && baseUsuarios[socket.nickKey]) {
      baseUsuarios[socket.nickKey].status = novoStatus;
      io.emit('lista-usuarios-reais', Object.values(baseUsuarios));
    }
  });

  // Envio de mensagem privada
  socket.on('send-private-message', (data) => {
    const remetente = socket.nickKey ? baseUsuarios[socket.nickKey] : null;
    const destNickKey = (data.paraNick || '').toLowerCase();
    const destinatario = baseUsuarios[destNickKey];

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

  // Ao desconectar, mantemos o cadastro na base com status offline
  socket.on('disconnect', () => {
    if (socket.nickKey && baseUsuarios[socket.nickKey]) {
      baseUsuarios[socket.nickKey].status = 'offline';
      baseUsuarios[socket.nickKey].socketId = null;
    }
    io.emit('lista-usuarios-reais', Object.values(baseUsuarios));
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor Colaê rodando na porta ${PORT}`));
