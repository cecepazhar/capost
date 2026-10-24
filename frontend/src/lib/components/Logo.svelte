<script lang="ts">
  interface Props {
    size?: number | string;
    mode?: 'light' | 'dark' | 'auto' | 'brand' | 'white';
    className?: string;
  }

  let { size = 28, mode = 'brand', className = '' }: Props = $props();

  const polygonStroke = $derived(mode === 'white' ? '#FFFFFF' : '#6366F1');
  const spineStroke = $derived(mode === 'light' ? '#0A0A0C' : '#FFFFFF');
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
    stroke={polygonStroke}
    stroke-width="28"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
  <line
    x1="256"
    y1="105"
    x2="256"
    y2="315"
    stroke={spineStroke}
    stroke-width="26"
    stroke-linecap="round"
  />
</svg>
