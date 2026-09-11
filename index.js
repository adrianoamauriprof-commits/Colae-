const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, { 
  cors: { origin: "*" },
  maxHttpBufferSize: 1e7 // 10MB para imagens em Base64
});

app.use(express.static('public'));

let contasCadastradas = {};
let socketsConectados = {}; // socket.id -> nickKey

io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);

  socket.emit('lista-usuarios-reais', Object.values(contasCadastradas).map(u => {
    const { senha, ...perfilPublico } = u;
    return perfilPublico;
  }));

  // REGISTRO AUTOMÁTICO / RECUPERAÇÃO DE SESSÃO SALVA
  socket.on('registrar-usuario', (dados) => {
    if (!dados || !dados.nick) return;
    const nickKey = dados.nick.toLowerCase();

    // Se o servidor reiniciou mas o cliente tem sessão salva, recriamos a conta na memória automaticamente
    if (!contasCadastradas[nickKey]) {
      contasCadastradas[nickKey] = {
        nick: dados.nick,
        senha: dados.senha || '123456',
        nome: dados.nome || 'Usuário',
        email: dados.email || '',
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
    }

    socketsConectados[socket.id] = nickKey;

    io.emit('lista-usuarios-reais', Object.values(contasCadastradas).map(u => {
      const { senha, ...p } = u;
      return p;
    }));
  });

  // CADASTRO MANUAL
  socket.on('solicitar-cadastro', (dados) => {
    if (!dados || !dados.nick) return;
    const nickKey = dados.nick.toLowerCase();

    const novoUsuario = {
      nick: dados.nick,
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

  // LOGIN
  socket.on('solicitar-login', (dados) => {
    if (!dados || !dados.nick) return;
    const nickKey = dados.nick.toLowerCase();
    let conta = contasCadastradas[nickKey];

    // Se a conta não existe na memória (servidor reiniciou), criamos temporariamente para permitir o login
    if (!conta) {
      conta = {
        nick: dados.nick,
        senha: dados.senha,
        nome: dados.nick.replace('@', ''),
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

  // RECUPERAÇÃO DE SENHA
  socket.on('solicitar-codigo-email', (email) => {
    const emailProc = (email || '').toLowerCase();
    const conta = Object.values(contasCadastradas).find(u => u.email === emailProc);

    if (!conta) {
      // Simulação para testes caso o servidor tenha reiniciado
      socket.emit('resposta-codigo-email', { sucesso: true, codigo: '123456', email: emailProc });
      return;
    }

    const codigo = Math.floor(100000 + Math.random() * 900000).toString();
    conta.codigoRecuperacao = codigo;
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
      socket.emit('resposta-redefinicao-senha', { sucesso: false, erro: 'Conta não encontrada na sessão atual.' });
    }
  });

  // MUDANÇA DE STATUS
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

  // MENSAGEM PRIVADA BLINDADA
  socket.on('send-private-message', (data) => {
    const remetenteNickKey = socketsConectados[socket.id];
    const remetente = remetenteNickKey ? contasCadastradas[remetenteNickKey] : null;
    
    const destNickKey = (data.paraNick || '').toLowerCase();
    let destinatario = contasCadastradas[destNickKey];

    // Se não encontrou pelo nick, tenta buscar pelo socketId correspondente
    if (!destinatario && data.paraId) {
      const nickEncontrado = socketsConectados[data.paraId];
      if (nickEncontrado) destinatario = contasCadastradas[nickEncontrado];
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

  // DESCONEXÃO
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
