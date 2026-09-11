const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// Armazena usuários ativos em memória
let usuariosConectados = {};

io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);

  // Registro ou entrada do usuário real
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
      status: 'online', // 'online' ou 'away'
      distKm: (Math.random() * 4.5 + 0.1).toFixed(2), // Simulação de distância via GPS
    };

    // Atualiza a lista de todos os conectados
    io.emit('lista-usuarios-reais', Object.values(usuariosConectados));
  });

  // Atualização do status de presença (Verde / Amarelo)
  socket.on('change-status', (novoStatus) => {
    if (usuariosConectados[socket.id]) {
      usuariosConectados[socket.id].status = novoStatus;
      io.emit('lista-usuarios-reais', Object.values(usuariosConectados));
    }
  });

  // Envio de mensagem privada
  socket.on('send-private-message', (data) => {
    const remetente = usuariosConectados[socket.id];
    io.to(data.paraId).emit('receive-private-message', {
      deId: socket.id,
      deNome: remetente ? remetente.nome : 'Usuário',
      deFoto: remetente ? remetente.foto : '',
      texto: data.texto,
      tipo: data.tipo || 'texto',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  });

  // Desconexão (Offline)
  socket.on('disconnect', () => {
    delete usuariosConectados[socket.id];
    io.emit('lista-usuarios-reais', Object.values(usuariosConectados));
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor Colaê ativo na porta ${PORT}`));
