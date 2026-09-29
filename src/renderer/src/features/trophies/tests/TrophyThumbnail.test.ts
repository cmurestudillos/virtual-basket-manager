/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import TrophyThumbnail from '../components/TrophyThumbnail.vue';

describe('TrophyThumbnail', () => {
  it('sin 3D en la máquina, enseña el trofeo plano en su metal y no un hueco', async () => {
    // jsdom no trae WebGL: es justo el caso que cubre el respaldo.
    const wrapper = mount(TrophyThumbnail, {
      props: { kind: 'continental_second', label: 'Eurocup' }
    });
    await flushPromises();

    expect(wrapper.find('img').exists()).toBe(false);
    const icon = wrapper.find('svg[data-trophy="continental_second"]');
    expect(icon.exists()).toBe(true);
    expect(icon.attributes('data-metal')).toBe('silver');
    expect(icon.attributes('aria-label')).toBe('Eurocup');
  });
});
