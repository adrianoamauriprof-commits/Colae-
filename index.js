const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, { 
  cors: { origin: "*" },
  maxHttpBufferSize: 2e7 
});

app.use(express.static('public'));

let contasCadastradas = {}; 

io.on('connection', (socket) => {
  console.log('Conectado:', socket.id);

  socket.emit('lista-usuarios-reais', Object.values(contasCadastradas).map(u => {
    const { senha, ...perfilPublico } = u;
    return perfilPublico;
  }));

  // CADASTRO / REGISTRO / LOGIN
  const salvarOuAtualizarUsuario = (dados) => {
    if (!dados || !dados.nick) return null;
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
      if (dados.senha) contasCadastradas[nickKey].senha = dados.senha;
      if (dados.nome) contasCadastradas[nickKey].nome = dados.nome;
    }

    // Coloca o socket na sala exclusiva do próprio nickname para entrega garantida
    socket.join(nickKey);
    return contasCadastradas[nickKey];
  };

  socket.on('registrar-usuario', (dados) => {
    const usuario = salvarOuAtualizarUsuario(dados);
    if (usuario) {
      io.emit('lista-usuarios-reais', Object.values(contasCadastradas).map(u => {
        const { senha, ...p } = u;
        return p;
      }));
    }
  });

  socket.on('solicitar-cadastro', (dados) => {
    if (!dados || !dados.nick) return;
    let nickKey = dados.nick.trim().toLowerCase();
    if (!nickKey.startsWith('@')) nickKey = '@' + nickKey;

    if (contasCadastradas[nickKey]) {
      socket.emit('resposta-cadastro', { sucesso: false, erro: 'Este nickname já está em uso!' });
      return;
    }

    const usuario = salvarOuAtualizarUsuario(dados);
    const { senha, ...perfilPublico } = usuario;
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
      socket.emit('resposta-login', { sucesso: false, erro: 'Nickname não cadastrado!' });
      return;
    }
    if (conta.senha !== dados.senha) {
      socket.emit('resposta-login', { sucesso: false, erro: 'Senha incorreta!' });
      return;
    }

    salvarOuAtualizarUsuario(dados);
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
    const conta = Object.values(contasCadastradas).find(u => u.socketId === socket.id);
    if (conta) {
      conta.status = novoStatus;
      io.emit('lista-usuarios-reais', Object.values(contasCadastradas).map(u => {
        const { senha, ...p } = u;
        return p;
      }));
    }
  });

  // ROTEAMENTO DIRETO E BLINDADO POR SALA E SOCKET ID
  socket.on('send-private-message', (data) => {
    const remetente = Object.values(contasCadastradas).find(u => u.socketId === socket.id) || 
                      contasCadastradas[(data.deNick || '').toLowerCase()];

    let destNickKey = (data.paraNick || '').trim().toLowerCase();
    if (destNickKey && !destNickKey.startsWith('@')) destNickKey = '@' + destNickKey;

    let destinatario = contasCadastradas[destNickKey];
    if (!destinatario && data.paraId) {
      destinatario = Object.values(contasCadastradas).find(u => u.socketId === data.paraId);
    }

    const payloadMensagem = {
      deId: socket.id,
      deNick: remetente ? remetente.nick : (data.deNick || '@usuario'),
      deNome: remetente ? remetente.nome : 'Usuário',
      deFoto: remetente ? remetente.foto : '',
      texto: data.texto,
      tipo: data.tipo || 'texto',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    // Envia tanto para o socketId direto quanto para a sala do nickname do destinatário
    if (destinatario) {
      if (destinatario.socketId) {
        io.to(destinatario.socketId).emit('receive-private-message', payloadMensagem);
      }
      io.to(destinatario.nick).emit('receive-private-message', payloadMensagem);
    } else if (destNickKey) {
      // Fallback caso a conta esteja apenas na sessão do client
      io.to(destNickKey).emit('receive-private-message', payloadMensagem);
    }
  });

  socket.on('disconnect', () => {
    const conta = Object.values(contasCadastradas).find(u => u.socketId === socket.id);
    if (conta) {
      conta.status = 'offline';
      conta.socketId = null;
    }
    io.emit('lista-usuarios-reais', Object.values(contasCadastradas).map(u => {
      const { senha, ...p } = u;
      return p;
    }));
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
