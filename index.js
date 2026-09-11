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
let socketsConectados = {}; // Mapeamento direto: socket.id -> nickKey

io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);

  socket.emit('lista-usuarios-reais', Object.values(contasCadastradas).map(u => {
    const { senha, ...perfilPublico } = u;
    return perfilPublico;
  }));

  // REGISTRO DE USUÁRIO / SESSÃO ATIVA
  socket.on('registrar-usuario', (dados) => {
    if (!dados || !dados.nick) return;
    const nickKey = dados.nick.toLowerCase();

    if (contasCadastradas[nickKey]) {
      contasCadastradas[nickKey].socketId = socket.id;
      contasCadastradas[nickKey].status = 'online';
    }
    socketsConectados[socket.id] = nickKey;

    io.emit('lista-usuarios-reais', Object.values(contasCadastradas).map(u => {
      const { senha, ...p } = u;
      return p;
    }));
  });

  // EVENTO DE CADASTRO
  socket.on('solicitar-cadastro', (dados) => {
    if (!dados || !dados.nick) return;
    const nickKey = dados.nick.toLowerCase();

    if (contasCadastradas[nickKey]) {
      socket.emit('resposta-cadastro', { sucesso: false, erro: 'Este nickname já está em uso!' });
      return;
    }

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

  // EVENTO DE LOGIN
  socket.on('solicitar-login', (dados) => {
    if (!dados || !dados.nick) return;
    const nickKey = dados.nick.toLowerCase();
    const conta = contasCadastradas[nickKey];

    if (!conta) {
      socket.emit('resposta-login', { sucesso: false, erro: 'Nickname não cadastrado!' });
      return;
    }

    if (conta.senha !== dados.senha) {
      socket.emit('resposta-login', { sucesso: false, erro: 'Senha incorreta!' });
      return;
    }

    conta.status = 'online';
    conta.socketId = socket.id;
    socketsConectados[socket.id] = nickKey;

    const { senha, ...perfilPublico } = conta;
    socket.emit('resposta-login', { sucesso: true, usuario: perfilPublico });

    io.emit('lista-usuarios-reais', Object.values(contasCadastradas).map(u => {
      const { senha, ...p } = u;
      return p;
    }));
  });

  // RECUPERAÇÃO DE SENHA VIA E-MAIL
  socket.on('solicitar-codigo-email', (email) => {
    const emailProc = (email || '').toLowerCase();
    const conta = Object.values(contasCadastradas).find(u => u.email === emailProc);

    if (!conta) {
      socket.emit('resposta-codigo-email', { sucesso: false, erro: 'Nenhuma conta cadastrada com este e-mail!' });
      return;
    }

    const codigo = Math.floor(100000 + Math.random() * 900000).toString();
    conta.codigoRecuperacao = codigo;

    socket.emit('resposta-codigo-email', { sucesso: true, codigo: codigo, email: emailProc });
  });

  socket.on('solicitar-redefinicao-senha', (dados) => {
    const emailProc = (dados.email || '').toLowerCase();
    const conta = Object.values(contasCadastradas).find(u => u.email === emailProc);

    if (conta && conta.codigoRecuperacao === dados.codigo) {
      conta.senha = dados.novaSenha;
      delete conta.codigoRecuperacao;
      const { senha, ...perfilPublico } = conta;
      socket.emit('resposta-redefinicao-senha', { sucesso: true, usuario: perfilPublico });
    } else {
      socket.emit('resposta-redefinicao-senha', { sucesso: false, erro: 'Código de verificação inválido!' });
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

  // MENSAGEM PRIVADA ROBUSTA (BUSCA POR SOCKET ID DIRETO OU NICKNAME)
  socket.on('send-private-message', (data) => {
    const remetenteNickKey = socketsConectados[socket.id];
    const remetente = remetenteNickKey ? contasCadastradas[remetenteNickKey] : null;
    
    const destNickKey = (data.paraNick || '').toLowerCase();
    let destinatario = contasCadastradas[destNickKey];

    // Fallback: se não achar pelo nick direto, busca pelo socketId caso tenha sido enviado
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
