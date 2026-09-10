const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

io.on('connection', (socket) => {
  console.log('Usuário conectado:', socket.id);

  socket.on('registrar-usuario', (dados) => {
    socket.usuario = dados;
  });

  socket.on('update-location', (coords) => {
    if (socket.usuario) {
      socket.usuario.lat = coords.lat;
      socket.usuario.lng = coords.lng;
    }
  });

  socket.on('send-private-message', (data) => {
    io.to(data.paraId).emit('receive-private-message', {
      deId: socket.id,
      deNome: data.deNome,
      texto: data.texto,
      tipo: data.tipo || 'texto'
    });
  });

  socket.on('disconnect', () => {
    console.log('Usuário desconectou:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Colaê rodando na porta ${PORT}`));
