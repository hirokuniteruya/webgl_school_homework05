
// = 013 ======================================================================
// 頂点の持つ法線と、ライトの向きを意味するベクトルとで内積を取っただけでは一見
// するとうまくいっているようでも、モデルを回転させたり移動させたりした場合に正
// しい結果が得られません。
// これは「頂点の位置が変化しているのに、法線はそのままになっている」ためです。
// これを改善するには、頂点が動いたことによって起こる変化を、法線に対しても適用
// してやる必要があります。
// しかし、ここにはやや難しい行列の問題が絡んでくるので……最初に答えだけ書いて
// しまうと「モデル行列の逆転置行列を用意して法線に乗算する」ことが必要です。
// なぜこのような計算によって法線が正しく処理できるのかは、ちょっと難しい行列の
// 話になってしまうので、講義で口頭で補足しますが、正直あまり正確にわかっていな
// かったとしてもそれほど気にしなくてもよいと思います。
// ※もちろん興味があれば行列を勉強してみましょう！
// ============================================================================

(() => {
    // webgl.js に記載のクラスを扱いやすいよう変数に入れておく
    const webgl = new WebGLUtility(); // WebGL API をまとめたユーティリティ
    const math  = WebGLMath;          // 線型代数の各種算術関数群
    const geo   = WebGLGeometry;      // 頂点ジオメトリを生成する関数群

    // 複数の関数で利用する広いスコープが必要な変数を宣言しておく
    let startTime = 0;            // 描画開始時のタイムスタンプ
    let isEnableCulling = false;  // フェイスカリングを有効化するかどうか
    let isEnableDepthTest = true; // 深度テストを有効化するかどうか
    let isSphereRotation = false; // 球体を回転させるかどうか

    let sphere      = null; // 球体のジオメトリ情報
    let sphereVBO   = null; // 球体用の VBO
    let sphereIBO   = null; // 球体用の IBO

    let attLocation = null; // attribute location
    let attStride   = null; // 頂点属性のストライド
    let uniLocation = null; // uniform location

    let vMatrix     = null; // ビュー行列
    let pMatrix     = null; // プロジェクション行列
    let vpMatrix    = null; // ビュー x プロジェクション行列

    let camera      = null; // 自作オービットコントロール風カメラ

    // ドキュメントの読み込みが完了したら実行されるようイベントを設定する
    window.addEventListener('DOMContentLoaded', () => {
        // special thanks! https://github.com/cocopon/tweakpane ===============
        const PANE = new Tweakpane({
            container: document.querySelector('#float-layer'),
        });
        PANE.addInput({'face-culling': isEnableCulling}, 'face-culling')
        .on('change', (v) => {isEnableCulling = v;});
        PANE.addInput({'depth-test': isEnableDepthTest}, 'depth-test')
        .on('change', (v) => {isEnableDepthTest = v;});
        PANE.addInput({'sphere-rotation': isSphereRotation}, 'sphere-rotation')
        .on('change', (v) => {isSphereRotation = v;});
        // ====================================================================

        const canvas = document.getElementById('webgl-canvas');
        webgl.initialize(canvas);
        const size = Math.min(window.innerWidth, window.innerHeight);
        webgl.width  = size;
        webgl.height = size;

        // カメラのインスタンスを生成
        const cameraOption = {
            distance: 5.0,
            min: 1.0,
            max: 10.0,
            move: 2.0,
        };
        camera = new WebGLOrbitCamera(canvas, cameraOption);

        let vs = null;
        let fs = null;
        WebGLUtility.loadFile('./shader/main.vert')
        .then((vertexShaderSource) => {
            vs = webgl.createShaderObject(vertexShaderSource, webgl.gl.VERTEX_SHADER);
            return WebGLUtility.loadFile('./shader/main.frag');
        })
        .then((fragmentShaderSource) => {
            fs = webgl.createShaderObject(fragmentShaderSource, webgl.gl.FRAGMENT_SHADER);
            webgl.program = webgl.createProgramObject(vs, fs);

            setupGeometry();
            setupLocation();
            startTime = Date.now();
            render();
        });
    }, false);

    /**
     * 頂点属性（頂点ジオメトリ）のセットアップを行う
     */
    function setupGeometry(){
        // 球体ジオメトリ情報と VBO、IBO の生成
        sphere = geo.sphere(32, 32, 1.0, [1.0, 1.0, 1.0, 1.0]);
        sphereVBO = [
            webgl.createVBO(sphere.position),
            webgl.createVBO(sphere.normal),
        ];
        sphereIBO = webgl.createIBO(sphere.index);
    }

    /**
     * 頂点属性のロケーションに関するセットアップを行う
     */
    function setupLocation(){
        const gl = webgl.gl;
        // attribute location の取得と有効化
        attLocation = [
            gl.getAttribLocation(webgl.program, 'position'),
            gl.getAttribLocation(webgl.program, 'normal'),
        ];
        attStride = [3, 3];
        // uniform 変数のロケーションの取得
        uniLocation = {
            mvpMatrix: gl.getUniformLocation(webgl.program, 'mvpMatrix'),
            normalMatrix: gl.getUniformLocation(webgl.program, 'normalMatrix'), // 法線変換用行列 @@@
            lightDirection: gl.getUniformLocation(webgl.program, 'lightDirection'),
        };
    }

    /**
     * レンダリングのためのセットアップを行う
     */
    function setupRendering(){
        const gl = webgl.gl;
        gl.viewport(0, 0, webgl.width, webgl.height);
        gl.clearColor(0.3, 0.3, 0.3, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        if(isEnableCulling === true){
            gl.enable(gl.CULL_FACE);
        }else{
            gl.disable(gl.CULL_FACE);
        }
        if(isEnableDepthTest === true){
            gl.enable(gl.DEPTH_TEST);
        }else{
            gl.disable(gl.DEPTH_TEST);
        }

        // ビュー x プロジェクション行列を生成
        vMatrix = camera.update();
        const fovy = 45;
        const aspect = webgl.width / webgl.height;
        const near = 0.1;
        const far = 20.0;
        pMatrix = math.mat4.perspective(fovy, aspect, near, far);
        vpMatrix = math.mat4.multiply(pMatrix, vMatrix);
    }

    /**
     * メッシュ情報の更新と描画を行う
     * @param {number} time - 経過時間
     */
    function renderMesh(time){
        const gl = webgl.gl;

        // 球体の VBO と IBO をバインドする
        webgl.enableAttribute(sphereVBO, attLocation, attStride);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sphereIBO);

        // モデル行列を生成する
        let mMatrix = math.mat4.identity(math.mat4.create());
        // フラグが立っている場合は回転させる
        if(isSphereRotation === true){
            mMatrix = math.mat4.rotate(mMatrix, time, [0.0, 1.0, 0.0]);
        }

        // 法線変換用の行列を生成してシェーダに送る @@@
        // ※モデル行列の逆転置行列
        const normalMatrix = math.mat4.transpose(math.mat4.inverse(mMatrix));
        gl.uniformMatrix4fv(uniLocation.normalMatrix, false, normalMatrix);

        // mvp 行列を生成してシェーダに送る
        const mvpMatrix = math.mat4.multiply(vpMatrix, mMatrix);
        gl.uniformMatrix4fv(uniLocation.mvpMatrix, false, mvpMatrix);

        // ライトベクトルを uniform 変数としてシェーダに送る
        gl.uniform3fv(uniLocation.lightDirection, [1.0, 1.0, 1.0]);

        // バインド中の頂点を描画する
        gl.drawElements(gl.TRIANGLES, sphere.index.length, gl.UNSIGNED_SHORT, 0);
    }

    /**
     * レンダリングを行う
     */
    function render(){
        const gl = webgl.gl;

        // 再帰呼び出しを行う
        requestAnimationFrame(render);

        // 時間の計測
        const nowTime = (Date.now() - startTime) / 1000;

        // レンダリング時のクリア処理など
        setupRendering();

        // メッシュを更新し描画を行う
        renderMesh(nowTime);
    }
})();

