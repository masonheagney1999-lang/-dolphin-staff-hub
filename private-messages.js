// Private messages are protected by Supabase RLS, including direct API requests.
export function initPrivateMessages(db) {
  const $ = id => document.getElementById(id);
  let currentUser = null, isOffice = false, generation = 0, recipients = new Map();
  const status = text => { $('messageStatus').textContent = text; };
  function clear() {
    $('messageList').replaceChildren();
    $('messageRecipient').replaceChildren();
    $('privateMessageForm').classList.add('hidden');
    $('privateMessageForm').reset();
    recipients.clear();
    status('');
  }
  async function loadMessages(token = generation) {
    if (!currentUser) return;
    status('');
    const {data,error} = await db.from('staff_private_messages')
      .select('id,recipient_id,message,created_at').order('created_at',{ascending:false}).limit(100);
    if (token !== generation) return;
    if (error) {
      status(isOffice ? 'Private messages need the Supabase update. Run private-messages.sql from your GitHub repository, then refresh this page.' : 'Messages are unavailable right now. Please contact the office.');
      return;
    }
    $('messageList').replaceChildren();
    if (!data.length) {
      const p = document.createElement('p');
      p.className = 'muted'; p.textContent = isOffice ? 'No private messages sent yet.' : 'No private messages for you yet.';
      $('messageList').append(p);
    }
    for (const message of data) {
      const item = document.createElement('article'); item.className = 'notice';
      const heading = document.createElement('strong');
      heading.textContent = isOffice ? 'To: ' + (recipients.get(message.recipient_id) || 'Staff account') : 'Message from the office';
      const body = document.createElement('p'); body.style.whiteSpace = 'pre-wrap'; body.style.overflowWrap = 'anywhere';
      body.textContent = message.message;
      const date = document.createElement('small'); date.textContent = new Date(message.created_at).toLocaleString('en-GB');
      item.append(heading,body,date); $('messageList').append(item);
    }
  }
  async function render(user) {
    const token = ++generation; currentUser = user; isOffice = false; clear();
    if (!user) return;
    const profile = await db.from('staff_profiles').select('role').eq('id',user.id).maybeSingle();
    if (token !== generation) return;
    isOffice = !profile.error && profile.data?.role === 'office';
    $('messageDescription').textContent = isOffice
      ? 'Send a private message to one staff member. Office admins can review sent messages. Latest 100 shown.'
      : 'Messages addressed to your account. Other drivers cannot see them. Latest 100 shown.';
    if (isOffice) {
      const {data,error} = await db.rpc('staff_message_recipients');
      if (token !== generation) return;
      if (error) { status('Run private-messages.sql in Supabase to enable private messaging, then refresh this page.'); return; }
      const prompt = new Option('Choose a staff member…',''); prompt.disabled = true; prompt.selected = true;
      $('messageRecipient').append(prompt);
      for (const person of data) {
        recipients.set(person.id,person.email);
        $('messageRecipient').append(new Option(person.email,person.id));
      }
      $('privateMessageForm').classList.remove('hidden');
    }
    await loadMessages(token);
  }
  $('refreshMessages').onclick = () => loadMessages().catch(() => status('Could not load messages. Please try again.'));
  $('privateMessageForm').onsubmit = async event => {
    event.preventDefault();
    if (!currentUser || !isOffice) return;
    const message = $('privateMessageText').value.trim(), recipient = $('messageRecipient').value;
    if (!message || !recipients.has(recipient)) { status('Choose a staff member and enter a message.'); return; }
    const token = generation;
    $('sendPrivateMessage').disabled = true; status('');
    try {
      const {error} = await db.from('staff_private_messages').insert({recipient_id:recipient,sender_id:currentUser.id,message});
      if (token !== generation) return;
      if (error) { status('Message was not sent: ' + error.message); return; }
      $('privateMessageText').value = '';
      await loadMessages(token);
      if (token === generation) status('Message sent to ' + recipients.get(recipient) + '.');
    } catch { if(token === generation) status('Could not confirm sending. Refresh messages before trying again.'); }
    finally { $('sendPrivateMessage').disabled = false; }
  };
  db.auth.onAuthStateChange((_event,session) => {
    // Clear previous-account content immediately, then query outside the auth callback.
    ++generation; currentUser = null; isOffice = false; clear();
    setTimeout(() => render(session?.user).catch(() => status('Could not load messages. Please refresh.')),0);
  });
  db.auth.getUser().then(({data}) => render(data.user)).catch(() => status('Could not load messages. Please refresh.'));
}

