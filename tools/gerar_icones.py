"""Gera os ícones PNG do app (casa com fissura sobre fundo azul).

Rodar da raiz do repositório:  python tools/gerar_icones.py
Precisa do Pillow (pip install pillow). Os PNGs gerados ficam em icons/.
"""
from pathlib import Path

from PIL import Image, ImageDraw

AZUL = (11, 61, 145, 255)      # mesma cor do theme_color do manifest
BRANCO = (255, 255, 255, 255)
AMBAR = (255, 179, 0, 255)
BASE = 1024                    # desenha grande e reduz (bordas suaves)
PASTA = Path(__file__).resolve().parent.parent / "icons"


def desenhar_casa(d: ImageDraw.ImageDraw, escala: float) -> None:
    """Casa + fissura, ocupando `escala` (0-1) do quadro, centralizada."""
    def p(x, y):  # coordenadas 0-1 dentro da área útil -> pixels
        m = (1 - escala) / 2
        return (BASE * (m + x * escala), BASE * (m + y * escala))

    # telhado
    d.polygon([p(0.06, 0.46), p(0.50, 0.08), p(0.94, 0.46)], fill=BRANCO)
    # corpo da casa
    d.rectangle([p(0.18, 0.42), p(0.82, 0.92)], fill=BRANCO)
    # porta
    d.rectangle([p(0.42, 0.66), p(0.58, 0.92)], fill=AZUL)
    # fissura (zigue-zague) na parede
    d.line([p(0.27, 0.48), p(0.34, 0.58), p(0.29, 0.66), p(0.37, 0.78), p(0.33, 0.88)],
           fill=AMBAR, width=int(BASE * 0.045 * escala), joint="curve")


def icone(escala: float, cantos_arredondados: bool) -> Image.Image:
    img = Image.new("RGBA", (BASE, BASE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if cantos_arredondados:
        d.rounded_rectangle([0, 0, BASE - 1, BASE - 1], radius=int(BASE * 0.18), fill=AZUL)
    else:
        d.rectangle([0, 0, BASE, BASE], fill=AZUL)
    desenhar_casa(d, escala)
    return img


def salvar(img: Image.Image, nome: str, tamanho: int) -> None:
    img.resize((tamanho, tamanho), Image.LANCZOS).save(PASTA / nome)
    print("gerado", nome)


if __name__ == "__main__":
    PASTA.mkdir(exist_ok=True)
    comum = icone(0.70, cantos_arredondados=True)
    salvar(comum, "icon-192.png", 192)
    salvar(comum, "icon-512.png", 512)
    # maskable: fundo cheio e desenho dentro da zona segura (círculo de 80%)
    salvar(icone(0.56, cantos_arredondados=False), "icon-maskable-512.png", 512)
    # iPhone não aceita transparência: fundo cheio
    salvar(icone(0.66, cantos_arredondados=False), "apple-touch-icon.png", 180)
