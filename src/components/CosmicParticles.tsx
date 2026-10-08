import React, { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  z: number; // глубина от 0.2 (далеко) до 1.0 (близко)
  baseRadius: number;
  radius: number;
  vx: number;
  vy: number;
  baseAlpha: number;
  alpha: number;
  colorType: 'cyan' | 'purple' | 'white' | 'blue';
  driftOffset: number;
  driftSpeed: number;
}

const PARTICLE_COUNT = 57; // Ровно 57 частиц по ТЗ пользователя

export const CosmicParticles: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', handleResize);

    // Инициализация 57 уникальных частиц разного размера, глубины и скорости
    const particles: Particle[] = [];
    const colorPalette = ['white', 'cyan', 'purple', 'blue'] as const;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      // z: 0.2 (далёкие маленькие частицы) до 1.0 (близкие крупные)
      const z = 0.2 + Math.random() * 0.8;
      const baseRadius = 0.8 + Math.random() * 2.8;
      const radius = baseRadius * (0.5 + z * 0.8);

      // Скорость зависит от глубины: далёкие двигаются медленнее, близкие быстрее
      const speed = (0.12 + Math.random() * 0.35) * (0.6 + z * 0.6);
      const angle = Math.random() * Math.PI * 2;

      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        z,
        baseRadius,
        radius,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        baseAlpha: 0.2 + z * 0.65,
        alpha: 0.2 + z * 0.65,
        colorType: colorPalette[i % colorPalette.length],
        driftOffset: Math.random() * 1000,
        driftSpeed: 0.001 + Math.random() * 0.002,
      });
    }

    let time = 0;

    const render = () => {
      time += 1;
      ctx.clearRect(0, 0, width, height);

      // Фоновый мягкий шейдерный шейд (радиальные отсветы и виньетка)
      const grad1 = ctx.createRadialGradient(
        width * 0.85, height * 0.15, 0,
        width * 0.85, height * 0.15, width * 0.65
      );
      grad1.addColorStop(0, 'rgba(6, 182, 212, 0.12)');
      grad1.addColorStop(1, 'rgba(6, 182, 212, 0)');
      ctx.fillStyle = grad1;
      ctx.fillRect(0, 0, width, height);

      const grad2 = ctx.createRadialGradient(
        width * 0.15, height * 0.22, 0,
        width * 0.15, height * 0.22, width * 0.55
      );
      grad2.addColorStop(0, 'rgba(217, 70, 239, 0.10)');
      grad2.addColorStop(1, 'rgba(217, 70, 239, 0)');
      ctx.fillStyle = grad2;
      ctx.fillRect(0, 0, width, height);

      // Обновление и отрисовка всех 57 левитирующих частиц
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Органическое покачивание (левитация) через синусоидальный дрейф
        const driftX = Math.sin((time + p.driftOffset) * p.driftSpeed) * 0.3;
        const driftY = Math.cos((time + p.driftOffset) * (p.driftSpeed * 0.8)) * 0.25;

        p.x += p.vx + driftX;
        p.y += p.vy + driftY;

        // Плавное мерцание яркости
        const pulse = Math.sin(time * 0.02 + p.driftOffset) * 0.15;
        p.alpha = Math.max(0.1, Math.min(1.0, p.baseAlpha + pulse));

        // Циклический перенос через границы экрана (бесшовный космос)
        if (p.x < -20) p.x = width + 20;
        else if (p.x > width + 20) p.x = -20;

        if (p.y < -20) p.y = height + 20;
        else if (p.y > height + 20) p.y = -20;

        // Цветовые оттенки в стиле космического неона
        let r = 255, g = 255, b = 255;
        if (p.colorType === 'cyan') {
          r = 6; g = 182; b = 212;
        } else if (p.colorType === 'purple') {
          r = 217; g = 70; b = 239;
        } else if (p.colorType === 'blue') {
          r = 59; g = 130; b = 246;
        }

        // Внешнее мягкое свечение (halo) для более близких и крупных частиц
        if (p.z > 0.45) {
          ctx.beginPath();
          const glowGrad = ctx.createRadialGradient(
            p.x, p.y, 0,
            p.x, p.y, p.radius * 3.5
          );
          glowGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${p.alpha * 0.45})`);
          glowGrad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
          ctx.fillStyle = glowGrad;
          ctx.arc(p.x, p.y, p.radius * 3.5, 0, Math.PI * 2);
          ctx.fill();
        }

        // Ядро частицы
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${p.alpha})`;
        ctx.shadowColor = `rgba(${r}, ${g}, ${b}, ${p.alpha * 0.8})`;
        ctx.shadowBlur = p.radius * 2;
        ctx.fill();
        ctx.shadowBlur = 0; // Сброс shadowBlur для производительности
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0 w-full h-full"
      style={{ opacity: 0.95 }}
    />
  );
};
