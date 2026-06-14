/**
 * CoreService - Lógica central do editor, manipulação de imagem e captura.
 */

export const core = {
    editorState: {
        zoom: 1,
        posX: 0,
        posY: 0,
        fontSize: 72,
        // Modo "fundo duplo": duas imagens lado a lado, cada uma com o seu ajuste.
        split: false,
        activeHalf: 'left',
        left: { src: '', zoom: 1, posX: 0, posY: 0 },
        right: { src: '', zoom: 1, posX: 0, posY: 0 }
    },

    setScale() {
        const isFlyerEditor = document.body.classList.contains('editor-active');

        if (!isFlyerEditor) return;

        const sidebarsWidth = 640; 
        const horizontalPadding = 72;
        const verticalPadding = 56;

        const availableWidth = window.innerWidth - sidebarsWidth - horizontalPadding;
        const availableHeight = window.innerHeight - verticalPadding;

        const targetWidth = 1080;
        const targetHeight = 1350;

        const scale = Math.max(0.15, Math.min(1, availableWidth / targetWidth, availableHeight / targetHeight));

        const wrapper = document.querySelector('.flyer-wrapper');

        if (wrapper) {
            wrapper.style.transform = 'scale(' + scale + ')';
            wrapper.style.transformOrigin = 'top center';
            wrapper.style.width = targetWidth + 'px';
            wrapper.style.height = targetHeight + 'px';

            const marginHorizontal = (targetWidth * (scale - 1)) / 2;
            wrapper.style.marginLeft = marginHorizontal + 'px';
            wrapper.style.marginRight = marginHorizontal + 'px';

            const scaledHeight = targetHeight * scale;
            wrapper.style.marginBottom = (scaledHeight - targetHeight + 20) + 'px';
        }
    },

    updateImageTransform() {
        const s = this.editorState;
        const single = document.querySelector('.layer-photo .photo-single');
        if (single) {
            single.style.transform = `translate(${s.posX}px, ${s.posY}px) scale(${s.zoom})`;
        }
        // Modo "fundo duplo": cada metade tem o seu próprio zoom/posição.
        ['left', 'right'].forEach(side => {
            const half = s[side];
            const img = document.querySelector(`.photo-half[data-half="${side}"] img`);
            if (img && half) {
                img.style.transform = `translate(${half.posX || 0}px, ${half.posY || 0}px) scale(${half.zoom || 1})`;
            }
        });
    },

    async captureCurrentFlyer() {
        const flyer = document.querySelector('.flyer');
        if (!flyer) {
            console.error('Erro: Elemento .flyer não encontrado no DOM.');
            throw new Error('Flyer não encontrado.');
        }

        const editor = document.getElementById('editor');
        if (editor) editor.blur();

        try {
            if (document.fonts && document.fonts.ready) {
                await document.fonts.ready;
            }

            await this.waitForImages(flyer);
            await new Promise(r => setTimeout(r, 100));

            const captureHost = document.createElement('div');
            captureHost.className = 'capture-host';
            const flyerClone = flyer.cloneNode(true);
            flyerClone.style.transform = 'none';
            flyerClone.style.left = '0';
            flyerClone.style.top = '0';
            flyerClone.style.margin = '0';
            flyerClone.style.position = 'relative';

            // O html2canvas (1.4.1) não respeita object-fit em <img> e estica a
            // foto (fica achatada). Solução: no clone, converter a foto para
            // background-image na própria camada, preservando o ajuste e o
            // zoom/posição (transform) — o html2canvas captura isto fielmente.
            const cloneLayer = flyerClone.querySelector('.layer-photo');
            if (cloneLayer && cloneLayer.classList.contains('is-split')) {
                // Modo "fundo duplo": converter CADA metade separadamente.
                // background-size: contain → mostra a imagem inteira, sem cortar
                // as laterais (igual ao modo single).
                flyerClone.querySelectorAll('.photo-half').forEach(half => {
                    half.classList.remove('active'); // tira o tracejado de seleção
                    const img = half.querySelector('img');
                    if (img && img.src) {
                        half.style.backgroundImage = `url("${img.src}")`;
                        half.style.backgroundSize = 'contain';
                        half.style.backgroundPosition = 'center';
                        half.style.backgroundRepeat = 'no-repeat';
                        // O transform da metade fica num wrapper interno para não
                        // mover o recorte (overflow:hidden) da própria metade.
                        const t = img.style.transform || '';
                        if (t) {
                            half.style.backgroundImage = 'none';
                            const fill = document.createElement('div');
                            fill.style.cssText = `position:absolute;inset:0;background-image:url("${img.src}");background-size:contain;background-position:center;background-repeat:no-repeat;transform:${t};transform-origin:center;`;
                            half.insertBefore(fill, half.firstChild);
                        }
                        img.remove();
                    }
                });
                // Remover a foto single escondida para não interferir.
                const hiddenSingle = flyerClone.querySelector('.layer-photo .photo-single');
                if (hiddenSingle) hiddenSingle.remove();
            } else {
                const cloneImg = flyerClone.querySelector('.layer-photo .photo-single')
                    || flyerClone.querySelector('.layer-photo img');
                if (cloneImg && cloneLayer && cloneImg.src) {
                    cloneLayer.style.backgroundImage = `url("${cloneImg.src}")`;
                    cloneLayer.style.backgroundSize = 'contain';
                    cloneLayer.style.backgroundPosition = 'center';
                    cloneLayer.style.backgroundRepeat = 'no-repeat';
                    cloneLayer.style.transform = cloneImg.style.transform || '';
                    cloneLayer.style.transformOrigin = 'center';
                    cloneImg.remove();
                    // Remover também a estrutura split escondida (se existir).
                    const split = cloneLayer.querySelector('.photo-split');
                    if (split) split.remove();
                }
            }

            captureHost.appendChild(flyerClone);
            document.body.appendChild(captureHost);

            const canvas = await html2canvas(flyerClone, {
                // 1080x1350 = tamanho nativo do design e o ideal para redes sociais
                // (IG retrato). scale 1 é ~4x mais rápido/leve que scale 2, sem perda
                // visível para publicar (PNG mantém o texto nítido).
                scale: 1,
                useCORS: true,
                allowTaint: false, // Alterado para false para evitar problemas de segurança que bloqueiam o canvas
                logging: false,
                backgroundColor: '#040830',
                width: 1080,
                height: 1350,
                windowWidth: 1080,
                windowHeight: 1350,
                proxy: null // Removido proxy para evitar falhas externas
            });

            const dataUrl = canvas.toDataURL('image/png');
            captureHost.remove();
            return dataUrl;
        } catch (err) {
            console.error('Erro detalhado na captura:', err);
            throw err;
        }
    },

    waitForImages(root) {
        const images = Array.from(root.querySelectorAll('img'));
        return Promise.all(images.map(img => {
            if (img.complete && img.naturalWidth > 0) return Promise.resolve();
            return new Promise(resolve => {
                img.onload = resolve;
                img.onerror = resolve;
            });
        }));
    }
};
