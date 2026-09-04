# Casamento Marcos & Suzana

Site estático pronto para publicar em Firebase Hosting ou em qualquer hospedagem de arquivos estáticos. Não há etapa de compilação: basta configurar o Firebase e enviar os arquivos.

## O que já está incluído

- Página inicial responsiva com data, horário, local, mapa, contagem regressiva e animações suaves.
- Busca de convite e confirmação individual, de casal ou de família.
- Lista pública apenas com presentes ainda disponíveis; a reserva é transacional para impedir dupla escolha.
- Tela administrativa protegida por Firebase Authentication.
- Cadastro, edição, exclusão, filtros e importação de Excel/CSV para convidados e presentes.
- Modelos de importação: `modelo-convidados.csv` e `modelo-presentes.csv`.

## Conectar ao Firebase

1. Crie um projeto em [Firebase Console](https://console.firebase.google.com/), adicione um aplicativo **Web** e copie o objeto de configuração gerado.
2. Em **Authentication → Sign-in method**, ative o provedor **E-mail/senha**. Crie os usuários que poderão administrar o casamento em **Authentication → Users**.
3. Em **Firestore Database**, crie um banco em modo de produção.
4. Abra `firebase-config.js`, cole as credenciais no objeto `firebaseConfig` e troque `seu-email@exemplo.com` por cada e-mail de administrador no array `adminEmails`.
5. Em **Firestore Database → Rules**, cole o conteúdo de `firestore.rules`. Altere também o e-mail de exemplo pela mesma lista de administradores e publique as regras.
6. Publique esta pasta. No Firebase Hosting, selecione esta pasta como diretório público. Não é necessário configurar um comando de build.

> As regras liberam a leitura dos nomes e status dos convidados para que a busca pública funcione. O telefone é usado apenas pelo painel, mas, para uma solução com privacidade máxima, use uma Cloud Function para intermediar a busca pública e mantenha os telefones em uma coleção privada.

## Planilhas

### Convidados

Colunas aceitas (sem diferenciar maiúsculas/minúsculas):

| nome | telefone | categoria | convite |   
| --- | --- | --- | --- |
| Ana Silva | (11) 99999-9999 | Família | familia-silva |

As categorias devem ser **Individual**, **Casal** ou **Família**. Pessoas que compartilham o mesmo convite (casal/família) devem ter exatamente o mesmo valor na coluna `convite`.

### Presentes

| nome | descricao |
| --- | --- |
| Jogo de panelas | Conjunto em inox |

Todos os presentes importados começam como disponíveis.

## Estrutura de dados

- `guests`: nome, telefone, categoria, inviteId, status, searchName.
- `gifts`: nome, descrição, available, reservedBy e reservedAt.

O painel usa os campos `searchName` e `inviteId` automaticamente. Não é necessário criá-los na planilha.
