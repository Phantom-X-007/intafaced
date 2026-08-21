<template>
  <div class="ix-page">
    <div class="ix-page-head"><h1>{{ $t('intafaced.modules.support.title') }}</h1><p>{{ $t('intafaced.support.lead') }}</p><div class="ix-source">svc-support · /api/support/trpc</div></div>
    <div class="ix-card"><div class="ix-card-head"><h2>{{ $t('intafaced.support.search') }}</h2><span class="ix-sub">searchKb</span></div><div class="ix-actions"><Input v-model="searchText" :placeholder="$t('intafaced.support.searchHint')" /><Button @click="search">{{ $t('intafaced.support.searchButton') }}</Button></div><IxState :loading="kb.loading" :reason="kb.reason" :message="kb.message" endpoint="/api/support/trpc/searchKb"><div v-if="kb.data && kb.data.length"><div v-for="article in kb.data" :key="article.id" class="ix-note" style="margin-top:12px;"><strong>{{ $t(article.titleKey) }}</strong><br>{{ $t(article.bodyKey) }}</div></div><div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.support.noResults') }}</div></IxState></div>
    <div class="ix-card"><div class="ix-card-head"><h2>{{ $t('intafaced.support.ticket') }}</h2><span class="ix-sub">create</span></div><div class="ix-form"><label>{{ $t('intafaced.support.category') }} <select v-model="form.category"><option value="account">{{ $t('intafaced.support.categories.account') }}</option><option value="trading">{{ $t('intafaced.support.categories.trading') }}</option><option value="deposit_withdraw">{{ $t('intafaced.support.categories.deposit_withdraw') }}</option><option value="other">{{ $t('intafaced.support.categories.other') }}</option></select></label><label>{{ $t('intafaced.support.subject') }} <Input v-model="form.subject" /></label><label>{{ $t('intafaced.support.body') }} <Input v-model="form.body" type="textarea" /></label><Button type="primary" :loading="ticket.busy" @click="createTicket">{{ $t('intafaced.support.submit') }}</Button></div><IxState v-if="ticket.ran" :loading="ticket.busy" :reason="ticket.reason" :message="ticket.message" endpoint="/api/support/trpc/create"><div v-if="ticket.data" class="ix-note ix-note-success">{{ $t('intafaced.support.created') }} · {{ ticket.data.id }}</div></IxState></div>
    <div class="ix-card"><div class="ix-card-head"><h2>{{ $t('intafaced.support.mine') }}</h2><span class="ix-sub">listMine</span></div><IxState :loading="tickets.loading" :reason="tickets.reason" :message="tickets.message" endpoint="/api/support/trpc/listMine"><div v-if="tickets.data && tickets.data.length" class="ix-scroll"><table class="ix-table"><thead><tr><th>{{ $t('intafaced.support.subject') }}</th><th>{{ $t('intafaced.support.category') }}</th><th>{{ $t('intafaced.support.status') }}</th><th></th></tr></thead><tbody><tr v-for="row in tickets.data" :key="row.id"><td>{{ row.subject }}</td><td>{{ row.category }}</td><td>{{ row.status }}</td><td><Button size="small" @click="openTicket(row)">{{ $t('intafaced.support.commentOpen') }}</Button></td></tr></tbody></table></div><div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.support.noTickets') }}</div></IxState></div>
    <div v-if="openedId" class="ix-card"><div class="ix-card-head"><h2>{{ $t('intafaced.support.comments') }}</h2><span class="ix-sub">listComments</span></div><IxState :loading="comments.loading" :reason="comments.reason" :message="comments.message" endpoint="/api/support/trpc/listComments"><div v-if="comments.data && comments.data.length"><div v-for="c in comments.data" :key="c.id" class="ix-note" style="margin-top:12px;"><strong>{{ c.authorRole }}</strong><br>{{ c.body }}</div></div><div v-else class="ix-note ix-note-quiet">{{ $t('intafaced.support.commentEmpty') }}</div></IxState><div class="ix-form"><label>{{ $t('intafaced.support.commentBody') }} <Input v-model="commentBody" type="textarea" :placeholder="$t('intafaced.support.commentHint')" /></label><Button type="primary" :loading="comment.busy" :disabled="!commentBody" @click="postComment">{{ $t('intafaced.support.commentSubmit') }}</Button></div><IxState v-if="comment.ran" :loading="comment.busy" :reason="comment.reason" :message="comment.message" endpoint="/api/support/trpc/comment"><div v-if="comment.data" class="ix-note ix-note-success">{{ $t('intafaced.support.commentPosted') }}</div></IxState></div>
  </div>
</template>
<script>
import IxState from '../../components/intafaced/IxState.vue';
import { query, mutate } from '../../config/intafaced.js';
import ixModule from '../../components/intafaced/module-mixin.js';
export default {
  name: 'IxSupport',
  components: { IxState },
  mixins: [ixModule],
  data() {
    return {
      searchText: '',
      form: { category: 'other', subject: '', body: '' },
      kb: this.emptySection(),
      ticket: this.emptyAction(),
      tickets: this.emptySection(),
      openedId: '',
      commentBody: '',
      comments: this.emptySection(),
      comment: this.emptyAction()
    };
  },
  created() { this.$store.commit('navigate', 'nav-platform'); this.search(); this.loadTickets(); },
  methods: {
    search() { this.load('kb', query('support', 'searchKb', { q: this.searchText }, this.ixToken)); },
    loadTickets() { this.load('tickets', query('support', 'listMine', undefined, this.ixToken)); },
    createTicket() { this.act('ticket', mutate('support', 'create', this.form, this.ixToken)).then(() => this.loadTickets()); },
    openTicket(row) {
      this.openedId = row.id;
      this.commentBody = '';
      this.comment = this.emptyAction();
      this.loadComments();
    },
    loadComments() {
      if (!this.openedId) return;
      this.load('comments', query('support', 'listComments', { ticketId: this.openedId }, this.ixToken));
    },
    postComment() {
      var self = this;
      if (!this.openedId || !this.commentBody) return;
      this.act('comment', mutate('support', 'comment', { ticketId: this.openedId, body: this.commentBody }, this.ixToken)).then(function(res) {
        if (res && res.ok) {
          self.commentBody = '';
          self.loadComments();
          self.loadTickets();
        }
      });
    }
  }
};
</script>
