<template>
  <div class="space-y-5">
    <!-- 检索表单：直接落画布，不包卡片 -->
    <section class="space-y-3">
      <SectionHeader title="馆藏检索" icon="book" />

      <!-- 搜索栏：MD2 填充式搜索框（无边框，聚焦变白） -->
      <form class="flex flex-col sm:flex-row gap-2.5" @submit.prevent="handleSearch">
        <select v-model="searchType" class="md-select sm:w-40">
          <option value="title">书名</option>
          <option value="author">作者</option>
          <option value="subject">主题词</option>
          <option value="Identifier">标准号(ISBN)</option>
        </select>

        <div class="relative flex-1">
          <Icon
            name="search"
            size="sm"
            class="absolute left-3.5 top-1/2 -translate-y-1/2 text-md-text-medium pointer-events-none"
          />
          <input
            v-model="keyword"
            type="text"
            required
            placeholder="输入书名、作者或关键词检索馆藏…"
            class="md-field pl-10"
          />
        </div>

        <button type="submit" class="md-btn-filled shrink-0" :disabled="loading || !keyword.trim()">
          <Icon v-if="loading" name="refresh" size="sm" class="animate-spin" />
          <span>{{ loading ? '检索中…' : '搜索' }}</span>
        </button>
      </form>
    </section>

    <!-- 检索结果：一个分组，每本书一行 -->
    <section class="space-y-3">
      <div v-if="totalCount > 0" class="text-md2-caption text-md-text-medium">
        共找到 <span class="tabular-nums">{{ totalCount }}</span> 条馆藏书目
      </div>

      <EmptyState
        v-if="books.length === 0 && searched"
        text="未检索到匹配的书籍，请更换关键词重试"
        icon="book"
        compact
      />

      <NoteCard v-if="books.length > 0" title="检索结果" :meta="`${books.length} 条`" :flush="true">
        <div class="md-feed-list">
        <div
          v-for="(book, idx) in books"
          :key="idx"
          class="md-feed-row items-start py-3.5 cursor-pointer"
          @click="openDetail(book)"
        >
          <div class="space-y-1.5 min-w-0 flex-1">
            <h3 class="text-md2-subtitle2 text-md-text-high line-clamp-2">{{ book.title }}</h3>
            <div class="text-md2-caption text-md-text-medium flex flex-wrap gap-x-3 gap-y-1">
              <span>作者 <span class="text-md-text-high">{{ book.author || '未知' }}</span></span>
              <span>出版社 <span class="text-md-text-high">{{ book.publisher || '未标明' }}</span></span>
              <span v-if="book.publishYear">年份 <span class="text-md-text-high tabular-nums">{{ book.publishYear }}</span></span>
            </div>
            <div class="flex items-center gap-2 flex-wrap pt-1">
              <span class="md-chip-neutral tabular-nums">索书号 {{ book.callNumber }}</span>
              <span v-if="book.isbn" class="text-md2-caption text-md-text-medium tabular-nums">
                ISBN {{ book.isbn }}
              </span>
            </div>
          </div>

          <span class="md-btn-text shrink-0 -mr-2">查看馆藏副本</span>
        </div>
        </div>
      </NoteCard>
    </section>

    <!-- 馆藏副本详情对话框 -->
    <div
      v-if="selectedBook"
      class="md-scrim flex items-center justify-center p-4"
      @click.self="selectedBook = null"
    >
      <div class="md-dialog rounded-md2-md max-w-lg max-h-[85vh] flex flex-col">
        <div class="md-dialog-header">
          <div class="min-w-0">
            <span class="md-chip-success">馆藏在架副本</span>
            <h3 class="md-dialog-title mt-2 leading-snug">{{ selectedBook.title }}</h3>
          </div>
          <button
            type="button"
            class="md-icon-btn-sm -mr-2 shrink-0"
            @click="selectedBook = null"
          >
            <Icon name="close" size="sm" />
          </button>
        </div>

        <div class="md-dialog-body overflow-y-auto border-t border-md-card-border pt-4 space-y-2">
          <div
            v-if="detailLoading"
            class="py-10 flex items-center justify-center gap-2 text-md2-body2 text-md-text-medium"
          >
            <Icon name="refresh" size="sm" class="animate-spin" />
            <span>加载中…</span>
          </div>

          <template v-else>
            <div v-if="!holdings.length" class="py-6 text-center text-md2-body2 text-md-text-medium">
              暂无具体分馆副本分布信息
            </div>

            <div v-else class="md-feed-card md-feed-list">
              <div
                v-for="(h, i) in holdings"
                :key="i"
                class="md-feed-row justify-between gap-3 py-2.5"
              >
                <div class="min-w-0">
                  <div class="text-md2-body2 text-md-text-high truncate">
                    {{ h.location || h.room || '校本部图书馆' }}
                  </div>
                  <div class="text-md2-caption text-md-text-medium mt-0.5 font-mono truncate">
                    条码/索书号 {{ h.barcode || h.callNumber || selectedBook.callNumber }}
                  </div>
                </div>
                <span
                  :class="h.status === '在馆' || h.isAvailable ? 'md-chip-success' : 'md-chip-neutral'"
                  class="shrink-0"
                >
                  {{ h.status || (h.isAvailable ? '在馆可借' : '已借出') }}
                </span>
              </div>
            </div>
          </template>
        </div>

        <div class="md-dialog-actions">
          <button type="button" class="md-btn-text" @click="selectedBook = null">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import SectionHeader from './ui/SectionHeader.vue';
import NoteCard from './ui/NoteCard.vue';
import EmptyState from './ui/EmptyState.vue';
import Icon from './Icon.vue';
import {
  searchLibraryBooks,
  fetchLibraryBookDetail,
  type LibraryBookItem,
} from '../api/library';

const keyword = ref('');
const searchType = ref('title');
const loading = ref(false);
const searched = ref(false);
const books = ref<LibraryBookItem[]>([]);
const totalCount = ref(0);

const selectedBook = ref<LibraryBookItem | null>(null);
const detailLoading = ref(false);
const holdings = ref<any[]>([]);

async function handleSearch() {
  if (!keyword.value.trim()) return;
  loading.value = true;
  searched.value = true;
  try {
    const res = await searchLibraryBooks(keyword.value.trim(), searchType.value);
    books.value = res.books || [];
    totalCount.value = res.totalCount || 0;
  } catch (e) {
    console.error('图书检索失败:', e);
    books.value = [];
  } finally {
    loading.value = false;
  }
}

async function openDetail(book: LibraryBookItem) {
  selectedBook.value = book;
  detailLoading.value = true;
  holdings.value = [];
  try {
    const res = await fetchLibraryBookDetail(book.detailParam);
    if (res?.holdings) {
      holdings.value = res.holdings;
    } else if (Array.isArray(res)) {
      holdings.value = res;
    }
  } catch (e) {
    console.error('读取书目详情失败:', e);
  } finally {
    detailLoading.value = false;
  }
}
</script>
