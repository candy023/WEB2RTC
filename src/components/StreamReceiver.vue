<script setup>
// VueのComposition APIから必要な関数をインポート
import { ref, onMounted, onUnmounted } from 'vue'
// SkyWay SDKの主要クラス・関数をインポート
import { SkyWayContext, SkyWayRoom, SkyWayStreamFactory, uuidV4 } from '@skyway-sdk/room'
// トークン取得関数（本番ではサーバー経由推奨）
import GetToken from '../../api/SkywayToken.js'

// --- 設定値・状態管理 ---
// FIXME: 秘密鍵はフロントに置かないこと（学習用の一時対応）
const tokenString = GetToken(import.meta.env.VITE_SKYWAY_APP_ID, import.meta.env.VITE_SKYWAY_SECRET_KEY)

// SkyWay関連のインスタンス
const ctx = ref(null)      // SkyWayContext
const room = ref(null)     // SkyWayRoom
const member = ref(null)   // 参加メンバー

// UI・状態管理用
const baseUrl = window.location.href.split('?')[0] // ルームURLのベース
const StreamArea = ref(null)                       // 映像・音声表示エリア
const RoomCreated = ref(false)                     // ルーム作成済みフラグ
const RoomId = ref(null)                           // ルームID
const isJoining = ref(false)                       // 参加中フラグ
const errorMessage = ref('')                       // エラーメッセージ
const tokenRef = ref(null);
// ローカルメディア関連
const localVideoEl = ref(null)     // ローカル映像要素
const localVideoStream = ref(null) // ローカル映像ストリーム
const localAudioStream = ref(null) // ローカル音声ストリーム

// ログ出力用
function log(...args){
  console.log('[SkyWay]', ...args)
}

// --- SkyWayContextの取得・初期化 ---
// トークン更新リマインダーも設定

async function getContext(){
  if(ctx.value) return ctx.value;
  tokenRef.value = await fetchSkywayToken(RoomId.value);
  ctx.value = await SkyWayContext.Create(tokenRef.value);
  ctx.value.onTokenUpdateReminder.add(async () => {
    tokenRef.value = await fetchSkywayToken(RoomId.value);
    await ctx.value.updateAuthToken(tokenRef.value);
  });
  return ctx.value;
}

// --- ルーム作成 ---
// SFU型ルームを新規作成または取得
const createRoom = async () => {
  if (!RoomId.value) RoomId.value = uuidV4()
  room.value = await SkyWayRoom.FindOrCreate(ctx.value, {
    type: 'sfu',
    name: RoomId.value
  })
  RoomCreated.value = true
  setupRoomEvents(room.value)
}

// --- ルームイベントの設定 ---
// 新規ストリーム公開・解除・メンバー離脱時の処理
function setupRoomEvents(r){
  // 新規ストリーム公開時
  r.onStreamPublished.add(async e => {
    log('onStreamPublished', e.publication.id)
    trySubscribe(e.publication)
  })
  // ストリーム解除時
  r.onStreamUnpublished.add(e => {
    removeMediaElement(e.publication.id)
  })
  // メンバー離脱時
  r.onMemberLeft.add(e => {
    e.member.publications?.forEach(p => removeMediaElement(p.id))
  })
}

// --- メディア要素管理 ---
// pubId -> { el, stream } のMap
const mediaElements = new Map()

// メディア要素の削除
function removeMediaElement(pubId){
  const entry = mediaElements.get(pubId)
  if (!entry) return
  entry.stream?.detach(entry.el)
  entry.el.remove()
  mediaElements.delete(pubId)
}

// --- ストリーム購読処理 ---
// 他メンバーの映像・音声を受信して表示
async function trySubscribe(publication){
  if (!member.value) return
  if (publication.publisher.id === member.value.id) return // 自分自身は除外
  if (!['video','audio'].includes(publication.contentType)) return
  try {
    const { stream } = await member.value.subscribe(publication.id)
    if (stream.track.kind === 'video'){
      const el = document.createElement('video')
      el.autoplay = true
      el.playsInline = true
      stream.attach(el)
      StreamArea.value.appendChild(el)
      mediaElements.set(publication.id, { el, stream })
    } else if (stream.track.kind === 'audio'){
      const el = document.createElement('audio')
      el.autoplay = true
      stream.attach(el)
      StreamArea.value.appendChild(el)
      mediaElements.set(publication.id, { el, stream })
    }
  } catch (e){
    console.error('subscribe失敗', publication.id, e)
  }
}

// --- ルーム参加処理 ---
// 既存ストリームの購読・ローカルメディアの公開
const joinRoom = async () => {
  if (isJoining.value) return
  isJoining.value = true
  errorMessage.value = ''
  try {
    if (!RoomId.value){
      alert('No Room ID')
      return
    }
    await getContext()
    if (!RoomCreated.value) await createRoom()

    // メンバーとして参加
    if (!member.value){
      member.value = await room.value.join({ name: uuidV4() })
    }

    // 既存の公開ストリームを一括購読
    for (const pub of room.value.publications){
      await trySubscribe(pub)
    }

    // ローカル映像・音声の生成と公開（初回のみ）
    if (!localVideoStream.value){
      const { audio, video } = await SkyWayStreamFactory.createMicrophoneAudioAndCameraStream()
      localAudioStream.value = audio
      localVideoStream.value = video
      await member.value.publish(audio)
      await member.value.publish(video)

      // ローカル映像のプレビュー表示
      localVideoEl.value = document.createElement('video')
      localVideoEl.value.autoplay = true
      localVideoEl.value.playsInline = true
      localVideoEl.value.muted = true
      localVideoEl.value.style.width = '100%'
      localVideoEl.value.style.height = '100%'
      video.attach(localVideoEl.value)
      StreamArea.value.appendChild(localVideoEl.value)
    }

  } catch (e){
    console.error(e)
    errorMessage.value = e.message
  } finally {
    isJoining.value = false
  }
}

// --- ライフサイクルフック ---
// マウント時：コンテキスト初期化＆URLパラメータからルームID取得
onMounted(async () => {
  await getContext()
  RoomId.value = new URLSearchParams(window.location.search).get('room')
})

// アンマウント時：リソース解放・クリーンアップ
onUnmounted(() => {
  try {
    // ローカルトラック停止
    localVideoStream.value?.track?.stop?.()
    localAudioStream.value?.track?.stop?.()
    // リモート要素解除
    mediaElements.forEach(({ el, stream }) => {
      stream?.detach(el)
      el.remove()
    })
    mediaElements.clear()
    // ルーム離脱・インスタンス破棄
    member.value?.leave?.()
    room.value?.dispose?.()
    ctx.value?.dispose?.()
  } catch (e){
    console.warn('cleanup error', e)
  }
})
</script>

<template>
  <h1>Kaigi</h1>
  <div class="card">
    <!-- 映像・音声表示エリア -->
    <div v-if="RoomCreated" ref="StreamArea"></div>
    <!-- ルーム未作成時：作成ボタン表示 -->
    <div v-else>
      <button @click="createRoom">Create Room</button>
    </div>

    <!-- ルームID・URL表示＆参加ボタン -->
    <div v-if="RoomId">
      <p>以下のURLは相手とシェア:</p>
      <p>{{ baseUrl }}?room={{ RoomId }}</p>
      <p>またはルームID:</p>
      <p>{{ RoomId }}</p>
      <p>会議を開始するため以下:</p>
      <button :disabled="isJoining" @click="joinRoom">
        {{ isJoining ? 'Joining...' : 'Join Room' }}
      </button>
    </div>

    <!-- エラー表示 -->
    <p v-if="errorMessage" style="color:red;">Error: {{ errorMessage }}</p>
  </div>
</template>
