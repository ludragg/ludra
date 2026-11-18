# Réplica da Tela Inicial do Discord (Aba "Amigos")

Réplica fiel da interface inicial do **Discord** (aba **Amigos**) em modo escuro, em português do Brasil (`pt-BR`), desenvolvida com **React + TypeScript + Tailwind CSS (Vite)** e ícones `lucide-react`.

## Como rodar o projeto

```bash
npm install && npm run dev
```

Para gerar o build de produção:

```bash
npm run build
```

## Estrutura de Componentes

- `src/components/ServerBar.tsx`: Coluna esquerda (`72px`) com o botão do Discord + badge vermelha `"1"`, linha divisória, lista de servidores (`48x48px`) com transição de círculo para *squircle* (`16px`), servidor `"OG"`, indicadores laterais brancos (*pill*), botões inferiores (`+`, explorar e download) que ficam verdes no hover e tooltip dinâmica ao passar o mouse.
- `src/components/Sidebar.tsx`: Barra lateral (`240px`, oculta abaixo de `768px`) com botão de busca rápida no topo, navegação (`Amigos`, `Nitro` com badge `1 MÊS GRÁTIS`, `Loja`, `Missões`), lista de DMs (`DMList`) e painel fixo do usuário (`UserPanel`).
- `src/components/DMList.tsx` & `src/components/DMItem.tsx`: Lista de mensagens diretas com scrollbar fina e escura, suporte a avatares sobrepostos para grupos, item oficial do Discord com badge azul `✓ OFICIAL`, ícone de coroa dourada (`#f0b132`) e botão `X` para fechar a conversa no hover.
- `src/components/UserPanel.tsx`: Rodapé fixo (`52px`, `#232428`) com avatar em status `Invisível`, nome estilizado, microfone mutado vermelho com seta dropdown, fone de ouvido com seta dropdown e botão de configurações.
- `src/components/FriendsHeader.tsx`: Cabeçalho (`48px`) com ícone e título `Amigos`, abas `Disponível`, `Todos`, botão `Adicionar amigo` (`#5865f2`) e ícones à direita.
- `src/components/FriendsList.tsx` & `src/components/FriendRow.tsx`: Busca em tempo real por nome/usuário, filtro por aba (`Disponível` / `Todos`), contagem `Online — 2`, linhas de amigos com atividade (`VALORANT` com ícone de controle) e estado vazio ilustrado.
- `src/components/ActiveNow.tsx`: Painel lateral direito (`Ativo agora`, escondido em telas `< 1200px`) com os cards de atividade do `gudysnei` (`VALORANT – 18m`) e resumo do jogo (`VALORANT`, `1 pessoa`).
- `src/components/Toast.tsx`: Card flutuante no canto inferior direito (`~360px`) simulando a notificação da **Ferramenta de Captura** com animação de *slide-in* e fechamento no botão `X`.
- `src/components/Avatar.tsx`: Componente reutilizável de avatar com suporte a tamanhos, status (`online` verde `#23a55a`, `offline`/`invisible` cinza `#80848e`) e avatares duplos de grupo.
- `src/data/mock.ts`: Dados mockados tipados para usuários, servidores, DMs e amigos.
