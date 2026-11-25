<script lang="ts">
  interface Props {
    size?: number | string;
    mode?: 'light' | 'dark' | 'auto' | 'brand' | 'white';
    className?: string;
  }

  let { size = 28, mode = 'brand', className = '' }: Props = $props();

  // Brand colour matches the app icon's arrow (#38BDF8, sky-400). On light
  // backgrounds a slightly deeper sky-500 keeps the same hue but stays legible.
  const strokeClass = $derived(
    mode === 'white'
      ? 'stroke-white'
      : mode === 'light'
        ? 'stroke-[#0EA5E9]'
        : mode === 'dark'
          ? 'stroke-[#38BDF8]'
          : 'stroke-[#0EA5E9] dark:stroke-[#38BDF8]'
  );
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 512 512"
  class="shrink-0 {className}"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <!-- Cyberpunk Monoline Wireframe / Tech-Brutalist Post-Arrow -->
  <polygon
    points="256,105 412,385 256,315 100,385"
    fill="none"
    class={strokeClass}
    stroke-width="28"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>
