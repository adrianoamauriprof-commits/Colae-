const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);

const io = new Server(server, { 
  cors: { origin: "*" },
  maxHttpBufferSize: 2e7 
});

app.use(express.static('public'));

// ARQUIVO DE PERSISTÊNCIA PARA NÃO PERDER CONTAS AO REINICIAR O SERVER
const ARQUIVO_DADOS = path.join(__dirname, 'dados.json');

let contasCadastradas = {};

// Carrega contas salvas anteriormente, se existirem
if (fs.existsSync(ARQUIVO_DADOS)) {
  try {
    const dadosSalvos = fs.readFileSync(ARQUIVO_DADOS, 'utf8');
    contasCadastradas = JSON.parse(dadosSalvos);
    console.log('Contas carregadas do arquivo com sucesso:', Object.keys(contasCadastradas).length);
  } catch (e) {
    console.error('Erro ao carregar dados salvos:', e);
  }
}

function salvarDadosNoDisco() {
  try {
    fs.writeFileSync(ARQUIVO_DADOS, JSON.stringify(contasCadastradas, null, 2), 'utf8');
  } catch (e) {
    console.error('Erro ao salvar dados no disco:', e);
  }
}

io.on('connection', (socket) => {
  console.log('Conectado:', socket.id);

  socket.emit('lista-usuarios-reais', Object.values(contasCadastradas).map(u => {
    const { senha, ...perfilPublico } = u;
    return perfilPublico;
  }));

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
        orientacao: dados.orientacao || 'Heterossexual',
        papel: dados.papel || 'Versátil',
        foto: dados.foto || '',
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
      if (dados.foto !== undefined) {
        contasCadastradas[nickKey].foto = dados.foto;
      }
      if (dados.senha) contasCadastradas[nickKey].senha = dados.senha;
      if (dados.nome) contasCadastradas[nickKey].nome = dados.nome;
      if (dados.idade) contasCadastradas[nickKey].idade = dados.idade;
      if (dados.sexo) contasCadastradas[nickKey].sexo = dados.sexo;
      if (dados.orientacao) contasCadastradas[nickKey].orientacao = dados.orientacao;
      if (dados.papel) contasCadastradas[nickKey].papel = dados.papel;
      if (dados.bio !== undefined) contasCadastradas[nickKey].bio = dados.bio;
      if (dados.altura !== undefined) contasCadastradas[nickKey].altura = dados.altura;
      if (dados.procura) contasCadastradas[nickKey].procura = dados.procura;
    }

    salvarDadosNoDisco();
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

    conta.socketId = socket.id;
    conta.status = 'online';
    salvarDadosNoDisco();

    socket.join(nickKey);
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
    socket.emit('resposta-codigo-email', { sucesso: true, codigo: codigo, email: emailProc });
  });

  socket.on('solicitar-redefinicao-senha', (dados) => {
    const emailProc = (dados.email || '').toLowerCase();
    const conta = Object.values(contasCadastradas).find(u => u.email === emailProc);

    if (conta) {
      conta.senha = dados.novaSenha;
      salvarDadosNoDisco();
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
      deSexo: remetente ? remetente.sexo : 'Outro',
      texto: data.texto,
      tipo: data.tipo || 'texto',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    if (destinatario) {
      if (destinatario.socketId) {
        io.to(destinatario.socketId).emit('receive-private-message', payloadMensagem);
      }
      io.to(destinatario.nick).emit('receive-private-message', payloadMensagem);
    } else if (destNickKey) {
      io.to(destNickKey).emit('receive-private-message', payloadMensagem);
    }
  });

  socket.on('disconnect', () => {
    const conta = Object.values(contasCadastradas).liberado ? null : Object.values(contasCadastradas).find(u => u.socketId === socket.id);
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
