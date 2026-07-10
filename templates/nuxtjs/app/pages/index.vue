<script setup lang="ts">
import {
  DialogRoot,
  DialogTrigger,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "reka-ui";

const { t } = useI18n();

const open = ref(false);
</script>

<template>
  <section>
    <h1 class="mb-3 text-3xl font-bold">{{ t("home.welcome") }} 👋</h1>
    <p class="mb-6 text-gray-600">{{ t("home.description") }}</p>
    <DialogRoot v-model:open="open">
      <DialogTrigger as-child>
        <UiButton>{{ t("home.open_dialog") }}</UiButton>
      </DialogTrigger>
      <DialogPortal>
        <DialogOverlay class="fixed inset-0 bg-black/40" />
        <DialogContent
          class="fixed left-1/2 top-1/2 w-105 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 shadow-xl"
        >
          <DialogTitle class="text-lg font-semibold">Hello from Reka UI</DialogTitle>
          <DialogDescription class="mt-1 text-sm text-gray-600">
            Headless components — bring your own styles.
          </DialogDescription>
          <DialogClose as-child>
            <UiButton variant="secondary" size="sm" class="mt-4">Close</UiButton>
          </DialogClose>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  </section>
</template>
