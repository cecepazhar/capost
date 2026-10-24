<script lang="ts">
  export let size: number | string = 28;
  export let mode: 'light' | 'dark' | 'auto' | 'brand' | 'white' = 'brand';
  export let className: string = '';

  $: polygonStroke = mode === 'white' ? '#FFFFFF' : '#6366F1';
  $: spineStroke = mode === 'light' ? '#0A0A0C' : '#FFFFFF';
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 512 512"
  class="shrink-0 {className}"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <!-- CAPost Cyberpunk Monoline Wireframe Post Arrow -->
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
