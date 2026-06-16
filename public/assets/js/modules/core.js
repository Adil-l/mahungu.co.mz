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

        // Formato Stories (9:16) usa o mesmo .flyer com .is-story → 1080×1920.
        const isStory = !!document.querySelector('.flyer.is-story');
        const targetWidth = 1080;
        const targetHeight = isStory ? 1920 : 1350;

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

        // Story (9:16) = mesmo .flyer com .is-story → captura 1080×1920.
        const isStory = flyer.classList.contains('is-story');
        const capHeight = isStory ? 1920 : 1350;

        try {
            if (document.fonts && document.fonts.ready) {
                await document.fonts.ready;
            }

            await this.waitForImages(flyer);
            await new Promise(r => setTimeout(r, 100));

            const captureHost = document.createElement('div');
            captureHost.className = 'capture-host' + (isStory ? ' is-story' : '');
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
                // 1080x1350 (feed) ou 1080x1920 (story 9:16) = tamanhos nativos do
                // design e ideais para redes sociais (IG retrato/story). scale 1 é
                // ~4x mais rápido/leve que scale 2, sem perda visível para publicar.
                scale: 1,
                useCORS: true,
                allowTaint: false, // Alterado para false para evitar problemas de segurança que bloqueiam o canvas
                logging: false,
                backgroundColor: '#040830',
                width: 1080,
                height: capHeight,
                windowWidth: 1080,
                windowHeight: capHeight,
                proxy: null // Removido proxy para evitar falhas externas
            });

            // JPEG (qualidade alta) em vez de PNG: MESMA resolução (1080x1350),
            // mas ~5-8x mais pequeno. Essencial porque a imagem é guardada e
            // sincronizada com o servidor — PNG base64 (vários MB) esgotava a
            // memória da instância (erros 500). q=0.92 mantém o texto nítido.
            const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
            captureHost.remove();
            return dataUrl;
        } catch (err) {
            console.error('Erro detalhado na captura:', err);
            throw err;
        }
    },

    /**
     * Grava um REEL (vídeo 9:16) compondo, em tempo real, os frames do vídeo de
     * fundo + as sobreposições do flyer (texto/logo/barras/onda) "queimadas".
     * Usa um canvas 1080x1920 + MediaRecorder. Devolve { videoDataUrl, poster }.
     * O resultado é WebM (o que o browser grava); o IG aceita MP4 — converter no
     * servidor (ffmpeg) é um passo posterior.
     */
    async captureReelVideo() {
        const flyer = document.querySelector('.flyer');
        const video = flyer && flyer.querySelector('.photo-video');
        if (!video || !video.getAttribute('src')) {
            throw new Error('Carrega um vídeo primeiro ("Trocar Vídeo").');
        }
        const W = 1080, H = 1920;

        // Garante que o vídeo tem dimensões/metadata.
        if (!video.videoWidth) {
            await new Promise((res) => {
                if (video.readyState >= 1) return res();
                video.onloadedmetadata = res;
                setTimeout(res, 4000);
            });
        }

        // 1) Sobreposições (texto/logo/barras/onda) como PNG transparente: esconde
        //    o vídeo/foto e o fundo do flyer, captura, repõe.
        const photo = flyer.querySelector('.photo-single');
        const prevVideoVis = video.style.visibility;
        const prevPhotoDisp = photo ? photo.style.display : '';
        const prevFlyerBg = flyer.style.background;
        video.style.visibility = 'hidden';
        if (photo) photo.style.display = 'none';
        flyer.style.background = 'transparent';
        if (document.fonts && document.fonts.ready) await document.fonts.ready;
        const overlayCanvas = await html2canvas(flyer, {
            backgroundColor: null, width: W, height: H, windowWidth: W, windowHeight: H,
            scale: 1, useCORS: true, logging: false,
        });
        video.style.visibility = prevVideoVis;
        if (photo) photo.style.display = prevPhotoDisp;
        flyer.style.background = prevFlyerBg;
        const overlay = new Image();
        overlay.src = overlayCanvas.toDataURL('image/png');
        try { await overlay.decode(); } catch (e) {}

        // 2) Canvas de composição + MediaRecorder. PREFERE MP4/H.264 (o que o
        //    Instagram aceita p/ Reels); senão WebM (fallback de browsers sem mp4).
        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');
        const canvasStream = canvas.captureStream(30);

        // Tenta juntar o ÁUDIO do vídeo original (se o browser deixar capturá-lo).
        let recordStream = canvasStream;
        try {
            const vs = typeof video.captureStream === 'function' ? video.captureStream()
                : (typeof video.mozCaptureStream === 'function' ? video.mozCaptureStream() : null);
            const at = vs ? vs.getAudioTracks() : [];
            if (at.length) recordStream = new MediaStream([...canvasStream.getVideoTracks(), at[0]]);
        } catch (e) {}

        const candidatos = [
            'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
            'video/mp4;codecs=avc1.42E01E',
            'video/mp4',
            'video/webm;codecs=vp9',
            'video/webm',
        ];
        const mime = candidatos.find((t) => { try { return MediaRecorder.isTypeSupported(t); } catch (e) { return false; } }) || 'video/webm';
        const isMp4 = mime.indexOf('video/mp4') === 0;
        const blobType = isMp4 ? 'video/mp4' : 'video/webm';
        const ext = isMp4 ? 'mp4' : 'webm';
        const recorder = new MediaRecorder(recordStream, { mimeType: mime, videoBitsPerSecond: 6000000 });
        const chunks = [];
        recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };

        // 3) Reproduz do início e desenha cada frame (vídeo cover + overlay).
        video.muted = true;
        try { video.currentTime = 0; } catch (e) {}
        await video.play().catch(() => {});
        const cover = (m) => {
            const mw = m.videoWidth, mh = m.videoHeight;
            if (!mw || !mh) return;
            const s = Math.max(W / mw, H / mh);
            const w = mw * s, h = mh * s;
            ctx.drawImage(m, (W - w) / 2, (H - h) / 2, w, h);
        };
        let raf;
        const draw = () => {
            ctx.fillStyle = '#040830';
            ctx.fillRect(0, 0, W, H);
            cover(video);
            ctx.drawImage(overlay, 0, 0, W, H);
            raf = requestAnimationFrame(draw);
        };
        draw();
        recorder.start();

        // 4) Para no fim do vídeo (máx. 30s).
        const durMs = Math.min((isFinite(video.duration) && video.duration ? video.duration : 15) * 1000, 30000);
        return await new Promise((resolve, reject) => {
            let done = false;
            const finish = () => {
                if (done) return; done = true;
                cancelAnimationFrame(raf);
                try { recorder.stop(); } catch (e) {}
                try { video.pause(); } catch (e) {}
            };
            video.onended = finish;
            const timer = setTimeout(finish, durMs);
            recorder.onstop = () => {
                clearTimeout(timer);
                const blob = new Blob(chunks, { type: blobType });
                const poster = canvas.toDataURL('image/jpeg', 0.7);
                const reader = new FileReader();
                reader.onloadend = () => resolve({ videoDataUrl: reader.result, poster, ext, mime: blobType });
                reader.onerror = () => reject(new Error('Falha a ler o vídeo gravado.'));
                reader.readAsDataURL(blob);
            };
            recorder.onerror = (e) => { finish(); reject((e && e.error) || new Error('Falha a gravar o vídeo.')); };
        });
    },

    waitForImages(root) {
        const images = Array.from(root.querySelectorAll('img'));
        return Promise.all(images.map(img => {
            // Já terminou (carregada OU falhada) ou nem tem src (ex.: os <img>
            // vazios do modo "fundo duplo") → não esperar, senão bloqueia para
            // sempre (esses nunca disparam onload/onerror).
            if (img.complete || !img.getAttribute('src')) return Promise.resolve();
            return new Promise(resolve => {
                img.onload = resolve;
                img.onerror = resolve;
                // Salvaguarda: nunca bloquear mais de 5s por imagem.
                setTimeout(resolve, 5000);
            });
        }));
    }
};
