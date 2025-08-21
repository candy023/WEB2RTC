<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { SkyWayContext, SkyWayRoom, SkyWayStreamFactory, uuidV4 } from '@skyway-sdk/room';
import { fetchSkywayToken } from '../services/skywayTokenClient.js';

// SkyWay関連
const ctx = ref(null);
const room = ref(null);
const member = ref(null);

// 状態
const StreamArea = ref(null);
const RoomCreated = ref(false);
const RoomId = ref(null);
const isJoining = ref(false);
const errorMessage = ref('');
const tokenRef = ref(null);

// ローカルメディア
const localVideoEl = ref(null);
const localVideoStream = ref(null);
const localAudioStream = ref(null);

// 管理用
const mediaElements = new Map(); // pubId -> { el, stream }

// URL ベース (表示用)
const baseUrl = window.location.href.split('?')[0];

function log(...a) {
  console.log('[SkyWay]', ...a);
}

// SkyWayContext 初期化
async function getContext() {
  if (ctx.value) return ctx.value;

  if (!RoomId.value) {
    RoomId.value = new URLSearchParams(location.search).get('room');
  }

  tokenRef.value = await fetchSkywayToken(RoomId.value);
  ctx.value = await SkyWayContext.Create(tokenRef.value);

  ctx.value.onTokenUpdateReminder.add(async () => {
    try {
      tokenRef.value = await fetchSkywayToken(RoomId.value);
      await ctx.value.updateAuthToken(tokenRef.value);
      log('Token refreshed');
    } catch (e) {
      console.error('Token refresh failed', e);
    }
  });

  return ctx.value;
}

// ルーム作成
async function createRoom() {
  if (!RoomId.value) RoomId.value = uuidV4();
  room.value = await SkyWayRoom.FindOrCreate(ctx.value, {
    type: 'sfu',
    name: RoomId.value
  });
  RoomCreated.value = true;
  setupRoomEvents(room.value);
}

// イベント設定
function setupRoomEvents(r) {
  r.onStreamPublished.add(e => trySubscribe(e.publication));
  r.onStreamUnpublished.add(e => removeMedia(e.publication.id));
  r.onMemberLeft.add(e => {
    e.member.publications?.forEach(p => removeMedia(p.id));
  });
}

// メディア削除
function removeMedia(pubId) {
  const entry = mediaElements.get(pubId);
  if (!entry) return;
  try {
    entry.stream?.detach(entry.el);
  } catch {}
  entry.el.remove();
  mediaElements.delete(pubId);
}

// 購読
async function trySubscribe(publication) {
  if (!member.value) return;
  if (publication.publisher.id === member.value.id) return;
  if (!['video', 'audio'].includes(publication.contentType)) return;
  try {
    const { stream } = await member.value.subscribe(publication.id);
    let el;
    if (stream.track.kind === 'video') {
      el = document.createElement('video');
      el.playsInline = true;
      el.autoplay = true;
    } else {
      el = document.createElement('audio');
      el.autoplay = true;
    }
    stream.attach(el);
    StreamArea.value.appendChild(el);
    mediaElements.set(publication.id, { el, stream });
  } catch (e) {
    console.warn('Subscribe failed', publication.id, e);
  }
}

// 参加
async function joinRoom() {
  if (isJoining.value) return;
  isJoining.value = true;
  errorMessage.value = '';
  try {
    if (!RoomId.value) {
      alert('No Room ID');
      return;
    }
    await getContext();
    if (!RoomCreated.value) await createRoom();

    if (!member.value) {
      member.value = await room.value.join({ name: uuidV4() });
    }

    // 既存 publication 購読
    for (const pub of room.value.publications) {
      await trySubscribe(pub);
    }

    // ローカル publish (初回のみ)
    if (!localVideoStream.value) {
      const { audio, video } = await SkyWayStreamFactory.createMicrophoneAudioAndCameraStream();
      localAudioStream.value = audio;
      localVideoStream.value = video;
      await member.value.publish(audio);
      await member.value.publish(video);

      localVideoEl.value = document.createElement('video');
      localVideoEl.value.autoplay = true;
      localVideoEl.value.playsInline = true;
      localVideoEl.value.muted = true;
      localVideoEl.value.style.width = '100%';
      localVideoEl.value.style.height = '100%';
      video.attach(localVideoEl.value);
      StreamArea.value.appendChild(localVideoEl.value);
      mediaElements.set('__local', { el: localVideoEl.value, stream: video });
    }
  } catch (e) {
    console.error(e);
    errorMessage.value = e.message;
  } finally {
    isJoining.value = false;
  }
}

onMounted(async () => {
  RoomId.value = new URLSearchParams(location.search).get('room');
  // ここで直ちに context を作らなくても良いが、先に用意する場合:
  try {
    await getContext();
  } catch (e) {
    console.error('Context init failed', e);
    errorMessage.value = e.message;
  }
});

onUnmounted(() => {
  try {
    mediaElements.forEach(({ el, stream }) => {
      try { stream.detach(el); } catch {}
      el.remove();
    });
    mediaElements.clear();
    localVideoStream.value?.track?.stop?.();
    localAudioStream.value?.track?.stop?.();
    member.value?.leave?.();
    room.value?.dispose?.();
    ctx.value?.dispose?.();
  } catch (e) {
    console.warn('cleanup error', e);
  }
});
</script>

<template>
  <h1>Kaigi</h1>
  <div class="card" style="max-width:800px;">
    <div v-if="RoomCreated" ref="StreamArea" style="display:grid; gap:12px;"></div>

    <div v-else style="margin-bottom:1rem;">
      <button @click="createRoom" :disabled="isJoining">Create Room</button>
    </div>

    <div v-if="RoomId">
      <p>共有用 URL:</p>
      <p style="word-break:break-all;">{{ baseUrl }}?room={{ RoomId }}</p>
      <p>Room ID: {{ RoomId }}</p>
      <button :disabled="isJoining" @click="joinRoom">
        {{ isJoining ? 'Joining...' : 'Join Room' }}
      </button>
    </div>
    <div v-else>
      <p>Room がまだありません。Create ボタンを押すか ?room=XXX を URL に付与してください。</p>
    </div>

    <p v-if="errorMessage" style="color:red;white-space:pre-line;">Error: {{ errorMessage }}</p>
  </div>
</template>

<style scoped>
.card button {
  padding: 6px 14px;
  font-size: 14px;
  cursor: pointer;
}
</style>