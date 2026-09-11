const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(express.static('public'));

// Armazena usuários por socket ID e por Nick
let usuariosConectados = {};

io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);

  // Registro/Reconexão automática do usuário
  socket.on('registrar-usuario', (dados) => {
    if (!dados || !dados.nick) return;
    
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

    io.emit('lista-usuarios-reais', Object.values(usuariosConectados));
  });

  // Atualização de Status
  socket.on('change-status', (novoStatus) => {
    if (usuariosConectados[socket.id]) {
      usuariosConectados[socket.id].status = novoStatus;
      io.emit('lista-usuarios-reais', Object.values(usuariosConectados));
    }
  });

  // Mensagem Privada (envio duplo: por nick e por socketId)
  socket.on('send-private-message', (data) => {
    const remetente = usuariosConectados[socket.id];
    
    // Procura destinatário por Nick ou por Socket ID
    const destinatario = Object.values(usuariosConectados).find(
      u => u.nick === data.paraNick || u.socketId === data.paraId
    );

    if (destinatario) {
      io.to(destinatario.socketId).emit('receive-private-message', {
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

  socket.on('disconnect', () => {
    delete usuariosConectados[socket.id];
    io.emit('lista-usuarios-reais', Object.values(usuariosConectados));
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor Colaê ativo na porta ${PORT}`));
