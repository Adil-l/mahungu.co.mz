/**
 * CoreService - Lógica central do editor, manipulação de imagem e captura.
 */

export const core = {
    editorState: {
        zoom: 1,
        posX: 0,
        posY: 0,
        fontSize: 72
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
        const img = document.querySelector('.layer-photo img');
        if (img) {
            img.style.transform = `translate(${this.editorState.posX}px, ${this.editorState.posY}px) scale(${this.editorState.zoom})`;
        }
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

            // O html2canvas (1.4.1) não respeita object-fit:cover em <img> e
            // estica a foto (fica achatada). Solução: no clone, converter a
            // foto para background-image:cover na própria camada, preservando
            // o zoom/posição (transform) — o html2canvas captura isto fielmente.
            const cloneImg = flyerClone.querySelector('.layer-photo img');
            const cloneLayer = flyerClone.querySelector('.layer-photo');
            if (cloneImg && cloneLayer && cloneImg.src) {
                cloneLayer.style.backgroundImage = `url("${cloneImg.src}")`;
                cloneLayer.style.backgroundSize = 'cover';
                cloneLayer.style.backgroundPosition = 'center';
                cloneLayer.style.backgroundRepeat = 'no-repeat';
                cloneLayer.style.transform = cloneImg.style.transform || '';
                cloneLayer.style.transformOrigin = 'center';
                cloneImg.remove();
            }

            captureHost.appendChild(flyerClone);
            document.body.appendChild(captureHost);

            const canvas = await html2canvas(flyerClone, {
                scale: 2,
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
