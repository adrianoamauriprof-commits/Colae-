const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, { 
  cors: { origin: "*" },
  maxHttpBufferSize: 2e7 // Aumentado para 20MB para garantir folga com imagens
});

app.use(express.static('public'));

let contasCadastradas = {}; 
let socketsConectados = {}; 

io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);

  socket.emit('lista-usuarios-reais', Object.values(contasCadastradas).map(u => {
    const { senha, ...perfilPublico } = u;
    return perfilPublico;
  }));

  socket.on('registrar-usuario', (dados) => {
    if (!dados || !dados.nick) return;
    let nickKey = dados.nick.trim().toLowerCase();
    if (!nickKey.startsWith('@')) nickKey = '@' + nickKey;

    if (!contasCadastradas[nickKey]) {
      contasCadastradas[nickKey] = {
        nick: nickKey,
        senha: dados.senha || '123456',
        nome: dados.nome || nickKey.replace('@', ''),
        email: (dados.email || '').toLowerCase(),
        idade: dados.idade || 18,
        sexo: dados.sexo || 'Outro',
        foto: dados.foto || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=500&auto=format&fit=crop&q=80',
        bio: dados.bio || '',
        altura: dados.altura || '',
        procura: dados.procura || 'Trocar uma ideia',
        status: 'online',
        socketId: socket.id,
        distKm: dados.distKm || (Math.random() * 4.5 + 0.1).toFixed(2)
      };
    } else {
      contasCadastradas[nickKey].socketId = socket.id;
      contasCadastradas[nickKey].status = 'online';
      if (dados.foto && dados.foto.startsWith('data:image')) {
        contasCadastradas[nickKey].foto = dados.foto;
      }
      if (dados.nome) contasCadastradas[nickKey].nome = dados.nome;
    }

    socketsConectados[socket.id] = nickKey;

    io.emit('lista-usuarios-reais', Object.values(contasCadastradas).map(u => {
      const { senha, ...p } = u;
      return p;
    }));
  });

  socket.on('solicitar-cadastro', (dados) => {
    if (!dados || !dados.nick) return;
    let nickKey = dados.nick.trim().toLowerCase();
    if (!nickKey.startsWith('@')) nickKey = '@' + nickKey;

    const novoUsuario = {
      nick: nickKey,
      senha: dados.senha,
      nome: dados.nome,
      email: dados.email ? dados.email.toLowerCase() : "",
      idade: dados.idade || 18,
      sexo: dados.sexo || "Outro",
      foto: dados.foto || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=500&auto=format&fit=crop&q=80",
      bio: dados.bio || "",
      altura: dados.altura || "",
      procura: dados.procura || "Trocar uma ideia",
      status: 'online',
      socketId: socket.id,
      distKm: (Math.random() * 4.5 + 0.1).toFixed(2)
    };

    contasCadastradas[nickKey] = novoUsuario;
    socketsConectados[socket.id] = nickKey;

    const { senha, ...perfilPublico } = novoUsuario;
    socket.emit('resposta-cadastro', { sucesso: true, usuario: perfilPublico });

    io.emit('lista-usuarios-reais', Object.values(contasCadastradas).map(u => {
      const { senha, ...p } = u;
      return p;
    }));
  });

  socket.on('solicitar-login', (dados) => {
    if (!dados || !dados.nick) return;
    let nickKey = dados.nick.trim().toLowerCase();
    if (!nickKey.startsWith('@')) nickKey = '@' + nickKey;

    let conta = contasCadastradas[nickKey];

    if (!conta) {
      conta = {
        nick: nickKey,
        senha: dados.senha,
        nome: nickKey.replace('@', ''),
        email: '',
        idade: 18,
        sexo: 'Outro',
        foto: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=500&auto=format&fit=crop&q=80',
        bio: '',
        altura: '',
        procura: 'Trocar uma ideia',
        status: 'online',
        socketId: socket.id,
        distKm: (Math.random() * 4.5 + 0.1).toFixed(2)
      };
      contasCadastradas[nickKey] = conta;
    } else {
      conta.senha = dados.senha;
      conta.status = 'online';
      conta.socketId = socket.id;
    }

    socketsConectados[socket.id] = nickKey;

    const { senha, ...perfilPublico } = conta;
    socket.emit('resposta-login', { sucesso: true, usuario: perfilPublico });

    io.emit('lista-usuarios-reais', Object.values(contasCadastradas).map(u => {
      const { senha, ...p } = u;
      return p;
    }));
  });

  socket.on('solicitar-codigo-email', (email) => {
    const emailProc = (email || '').toLowerCase();
    const conta = Object.values(contasCadastradas).find(u => u.email === emailProc);
    const codigo = '123456';
    if (conta) conta.codigoRecuperacao = codigo;
    socket.emit('resposta-codigo-email', { sucesso: true, codigo: codigo, email: emailProc });
  });

  socket.on('solicitar-redefinicao-senha', (dados) => {
    const emailProc = (dados.email || '').toLowerCase();
    const conta = Object.values(contasCadastradas).find(u => u.email === emailProc);

    if (conta) {
      conta.senha = dados.novaSenha;
      const { senha, ...perfilPublico } = conta;
      socket.emit('resposta-redefinicao-senha', { sucesso: true, usuario: perfilPublico });
    } else {
      socket.emit('resposta-redefinicao-senha', { sucesso: false, erro: 'Conta não encontrada.' });
    }
  });

  socket.on('change-status', (novoStatus) => {
    const nickKey = socketsConectados[socket.id];
    if (nickKey && contasCadastradas[nickKey]) {
      contasCadastradas[nickKey].status = novoStatus;
      io.emit('lista-usuarios-reais', Object.values(contasCadastradas).map(u => {
        const { senha, ...p } = u;
        return p;
      }));
    }
  });

  // ROTEAMENTO UNIVERSAL DIRETO PARA TEXTO E FOTOS
  socket.on('send-private-message', (data) => {
    const remetenteNickKey = socketsConectados[socket.id];
    let remetente = remetenteNickKey ? contasCadastradas[remetenteNickKey] : null;

    if (!remetente && data.deNick) {
      let dNick = data.deNick.trim().toLowerCase();
      if (!dNick.startsWith('@')) dNick = '@' + dNick;
      remetente = contasCadastradas[dNick];
    }

    let destNickKey = (data.paraNick || '').trim().toLowerCase();
    if (destNickKey && !destNickKey.startsWith('@')) destNickKey = '@' + destNickKey;

    let destinatario = contasCadastradas[destNickKey];

    if (!destinatario && data.paraId) {
      const nickEncontrado = socketsConectados[data.paraId];
      if (nickEncontrado) destinatario = contasCadastradas[nickEncontrado];
    }

    if (!destinatario && data.paraId) {
      destinatario = Object.values(contasCadastradas).find(u => u.socketId === data.paraId);
    }

    if (destinatario && destinatario.socketId) {
      io.to(destinatario.socketId).emit('receive-private-message', {
        deId: socket.id,
        deNick: remetente ? remetente.nick : (data.deNick || '@usuario'),
        deNome: remetente ? remetente.nome : 'Usuário',
        deFoto: remetente ? remetente.foto : '',
        texto: data.texto,
        tipo: data.tipo || 'texto',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
    }
  });

  socket.on('disconnect', () => {
    const nickKey = socketsConectados[socket.id];
    if (nickKey && contasCadastradas[nickKey]) {
      contasCadastradas[nickKey].status = 'offline';
      contasCadastradas[nickKey].socketId = null;
    }
    delete socketsConectados[socket.id];
    io.emit('lista-usuarios-reais', Object.values(contasCadastradas).map(u => {
      const { senha, ...p } = u;
      return p;
    }));
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor Colaê rodando na porta ${PORT}`));
