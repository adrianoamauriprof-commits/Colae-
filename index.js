const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// Mapeia os usuários por socket.id
let usuariosConectados = {};

io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);

  // Registro ou login do usuário
  socket.on('registrar-usuario', (dados) => {
    usuariosConectados[socket.id] = {
      socketId: socket.id,
      nick: dados.nick,
      nome: dados.nome,
      idade: dados.idade,
      sexo: dados.sexo,
      foto: dados.foto || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=500&auto=format&fit=crop&q=80",
      bio: dados.bio || "",
      altura: dados.altura || "",
      procura: dados.procura || "Trocar uma ideia",
      status: 'online',
      distKm: (Math.random() * 4.5 + 0.1).toFixed(2)
    };

    // Transmite a lista completa para todos
    io.emit('lista-usuarios-reais', Object.values(usuariosConectados));
  });

  // Atualização do status de presença (Verde / Amarelo)
  socket.on('change-status', (novoStatus) => {
    if (usuariosConectados[socket.id]) {
      usuariosConectados[socket.id].status = novoStatus;
      io.emit('lista-usuarios-reais', Object.values(usuariosConectados));
    }
  });

  // Envio de mensagem privada direcionada pelo Nick/Socket
  socket.on('send-private-message', (data) => {
    const remetente = usuariosConectados[socket.id];
    
    // Procura o socketId do destinatário pelo nick ou socketId
    let destinatarioSocketId = data.paraId;
    if (data.paraNick) {
      const dest = Object.values(usuariosConectados).find(u => u.nick === data.paraNick);
      if (dest) destinatarioSocketId = dest.socketId;
    }

    if (destinatarioSocketId) {
      io.to(destinatarioSocketId).emit('receive-private-message', {
        deId: socket.id,
        deNick: remetente ? remetente.nick : '',
        deNome: remetente ? remetente.nome : 'Usuário',
        deFoto: remetente ? remetente.foto : '',
        texto: data.texto,
        tipo: data.tipo || 'texto',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
    }
  });

  // Desconexão
  socket.on('disconnect', () => {
    delete usuariosConectados[socket.id];
    io.emit('lista-usuarios-reais', Object.values(usuariosConectados));
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor Colaê ativo na porta ${PORT}`));
