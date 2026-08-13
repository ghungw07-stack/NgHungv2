class MasterCaro {
  constructor() {
    // Cấu hình bàn cờ 16x16 theo yêu cầu
    this.SIZE = 16;

    // Mã hóa quân cờ (khớp với C#): 0=rỗng, 1=trắng(O), 2=đen(X), 3=biên
    this.BLANK_VALUE = 0;
    this.WHITE_VALUE = 1; // O
    this.BLACK_VALUE = 2; // X
    this.WALL_VALUE = 3;

    // Mapping AI/USER theo kiểu dùng phổ biến trong repo
    this.USER_VALUE = this.WHITE_VALUE;
    this.AI_VALUE = this.BLACK_VALUE;

    // Độ sâu mặc định (C# đặt theo thời gian; ở đây dùng hằng)
    this.MAX_DEPTH = 6;

    // ====== PORT từ ViteznyEngine.cs ======
    // Engine state (tương ứng các biến cấp lớp trong C#)
    this.player = 0; // 0=white(O), 1=black(X) - người SẮP đánh (đổi sau mỗi doMove)
    this.moves = 0; // số nước đã có trong engine
    this.width = this.SIZE; // 16
    this.height = this.SIZE; // 16
    this.height2 = this.height + 2; // height+2

    // Offset 8 hướng + 0 cho C#
    this.diroff = new Array(9).fill(0);

    // Hệ số giống C# (đánh giá mẫu)
    this.H10 = 2;
    this.H11 = 6;
    this.H12 = 10;
    this.H20 = 23;
    this.H21 = 158;
    this.H22 = 175;
    this.H30 = 256;
    this.H31 = 511;
    this.H4 = 2047;
    this.priority = [
      [0, 1, 1],
      [this.H10, this.H11, this.H12],
      [this.H20, this.H21, this.H22],
      [this.H30, this.H31, 0],
      [this.H4, 0, 0],
    ];

    this.sum = [0, 0]; // tổng ưu tiên cho 2 bên
    this.dpth = 0;
    this.depth = this.MAX_DEPTH; // cập nhật mỗi lượt nếu muốn
    this.D = [7, 5, 4];

    this.McurMoves = 384;
    this.MwinMoves = 400;
    this.curMoves = new Array(this.McurMoves).fill(0);
    this.winMoves1 = new Array(this.MwinMoves).fill(0);
    this.winEval = new Array(this.MwinMoves).fill(0);

    // goodMoves[4][2], winMove[2][2]
    this.goodMoves = Array.from({ length: 4 }, () => [0, 0]);
    this.winMove = [
      [0, 0],
      [0, 0],
    ];

    this.UwinMoves = 0;
    this.lastMove = 0; // index p trong board 1D
    this.bestMove = 0; // kết quả chọn cuối

    // Board 1D có biên theo cách C#
    this.board = [];
    this.boardk = 0; // giới hạn cuối cho lặp

    // Bảng K cho evaluate: 2 x 262144 (mẫu 9 ô, mỗi ô 0..3)
    this.K = [new Array(262144).fill(0), new Array(262144).fill(0)];

    // Khởi tạo engine: diroff, board (biên), K
    this.initEngine();
  }

  // ================== PUBLIC API ==================
  // makeMove: nhận board 2D (16x16) chứa "X"/"O"/null, botSymbol "X" hoặc "O"; trả về index 0..255
  makeMove(board2D, botSymbol, options = {}) {
    // Đồng bộ trạng thái engine từ bàn cờ đầu vào (cộng dồn)
    this.syncFromBoard(board2D, botSymbol, options);

    // Thực hiện tính nước đi theo đúng trình tự của C# (computer1)
    this.computer1();

    // Trả về toạ độ theo định dạng vị trí 0..255
    const row = this.board[this.lastMove].y;
    const col = this.board[this.lastMove].x;
    return row * this.SIZE + col;
  }

  // ================== ENGINE CORE ==================
  initEngine() {
    // offsets cho 8 hướng + 0
    this.diroff[0] = 1; // +y
    this.diroff[4] = -this.diroff[0];
    this.diroff[1] = 1 + this.height2; // +x +y
    this.diroff[5] = -this.diroff[1];
    this.diroff[2] = this.height2; // +x
    this.diroff[6] = -this.diroff[2];
    this.diroff[3] = -1 + this.height2; // +x -y
    this.diroff[7] = -this.diroff[3];
    this.diroff[8] = 0;

    // Khởi tạo board với viền: kích thước (width+12) * (height+2)
    const W = this.width + 12;
    const H2 = this.height2; // height+2
    this.board = new Array(W * H2);

    let p = 0;
    for (let x = -5; x <= this.width + 6; x++) {
      for (let y = 0; y <= this.height + 1; y++) {
        this.board[p] = {
          z: x < 1 || y < 1 || x > this.width || y > this.height ? this.WALL_VALUE : this.BLANK_VALUE,
          h: [this.makePrior(), this.makePrior()],
          x: x - 1,
          y: y - 1,
        };
        p++;
      }
    }
    this.boardk = (this.width + 6) * this.height2;

    // Reset counters
    this.moves = 0;
    this.sum = [0, 0];
    this.goodMoves = Array.from({ length: 4 }, () => [0, 0]);
    this.winMove = [
      [0, 0],
      [0, 0],
    ];

    // Sinh bảng K (precompute đánh giá 9 ô)
    this.gen();
  }

  makePrior() {
    return { pv: 4, ps0: 1, ps1: 1, ps2: 1, ps3: 1, i: 0, nxt: 0, pre: 0 };
  }

  // Đồng bộ từ board 2D vào engine theo trình tự của NajdiNejlepsiTah
  syncFromBoard(board2D, botSymbol, options = {}) {
    // Nếu options là mảng -> chính là lịch sử nước đi gameInstance.moves
    if (Array.isArray(options)) {
      const movesHistory = options;

      // Nếu số nước trong engine không khớp lịch sử -> rebuild toàn bộ từ đầu
      if (this.moves !== movesHistory.length) {
        // Khởi tạo lại toàn bộ engine
        this.initEngine();

        // Thiết lập người chơi chuẩn bị đánh dựa trên ký hiệu bot để logic doMove tương thích
        // player = 0 nghĩa là quân trắng (O) sắp đánh, 1 là đen (X)
        this.player = botSymbol === "O" ? 0 : 1;

        // Áp dụng toàn bộ nước đi theo đúng thứ tự lịch sử
        for (const mv of movesHistory) {
          // position là index 0..(SIZE*SIZE-1)
          const row = Math.floor(mv.position / this.SIZE);
          const col = mv.position % this.SIZE;
          const zColor = mv.symbol === "O" ? this.WHITE_VALUE : this.BLACK_VALUE;

          const p = this.findEngineIndexByRowCol(row, col);
          if (p !== -1) {
            this.forceDoMoveWithColor(p, zColor);
          }
        }
      }

      // Thiết lập depth theo adaptive hoặc override (không có depth trong mode này)
      this.depth = this.computeAdaptiveDepth();
      return;
    }

    // Xác lập người chơi theo lần đầu (khớp C#)
    if (this.moves === 0) {
      // Nếu botSymbol là "O" (trắng) => player=1, ngược lại 0
      this.player = botSymbol === "O" ? 1 : 0;
    }

    // Tìm nước đi mới (của đối thủ) chưa có trong engine và áp dụng
    // p khởi đầu theo C#: 6*height2 + 1
    let p = 6 * this.height2 + 1;
    let found = false;

    for (let x = 0; x < this.width && !found; x++) {
      for (let y = 0; y < this.height && !found; y++) {
        const cell = board2D[y][x];
        // Map ký hiệu sang z
        const zWanted = cell === "O" ? this.WHITE_VALUE : cell === "X" ? this.BLACK_VALUE : this.BLANK_VALUE;
        if (zWanted === this.WHITE_VALUE) {
          if (this.board[p].z !== this.WHITE_VALUE) {
            // Áp dụng nước đi trắng
            this.forceDoMoveWithColor(p, this.WHITE_VALUE);
            found = true;
          }
        } else if (zWanted === this.BLACK_VALUE) {
          if (this.board[p].z !== this.BLACK_VALUE) {
            // Áp dụng nước đi đen
            this.forceDoMoveWithColor(p, this.BLACK_VALUE);
            found = true;
          }
        }
        p++;
      }
      p += 2;
    }

    if (!found) {
      // Không thấy nước đối thủ mới => tôi chuẩn bị đánh nước đầu của mình
      // C#: player=0; if(barvaNaTahu==Cerny) player=1;
      this.player = botSymbol === "X" ? 1 : 0;
    }

    // Đặt depth theo số nước đã đánh (giảm dần về 4), cho phép override bằng options.depth
    if (options && typeof options.depth === "number") {
      this.depth = options.depth;
    } else {
      this.depth = this.computeAdaptiveDepth();
    }
  }

  // Tìm chỉ số p trong board 1D theo row/col thực tế 0..SIZE-1
  findEngineIndexByRowCol(row, col) {
    // Bắt đầu tại p theo quy ước (x=0,y=0) -> 6*height2 + 1
    let p = 6 * this.height2 + 1;
    for (let x = 0; x < this.width; x++) {
      for (let y = 0; y < this.height; y++) {
        if (this.board[p].x === x && this.board[p].y === y) {
          if (y === row && x === col) return p;
        }
        p++;
      }
      p += 2; // bỏ qua viền theo cấu trúc khởi tạo
    }
    return -1;
  }

  // Gán nước đi lên board với màu xác định, cập nhật 'player' để doMove thực hiện đúng
  forceDoMoveWithColor(p, zColor) {
    // Đặt player sao cho doMove(p) ghi đúng z
    this.player = zColor - 1; // zColor 1->player=0, 2->player=1
    this.doMove(p);
  }

  isInside(r, c) {
    return r >= 0 && r < this.SIZE && c >= 0 && c < this.SIZE;
  }

  // ======== Các hàm tiện ích nhỏ (port từ C#) ========
  max(a, b) {
    return a > b ? a : b;
  }

  abs(x) {
    return x >= 0 ? x : -x;
  }

  distance(p1, p2) {
    return this.max(this.abs(this.board[p1].x - this.board[p2].x), this.abs(this.board[p1].y - this.board[p2].y));
  }

  // Tính depth thích nghi dựa vào số nước đã đánh; giảm dần từ MAX_DEPTH về 4
  computeAdaptiveDepth() {
    // Giảm 1 mức depth mỗi 10 nước (cả hai bên), tối thiểu 4
    const dropEvery = 10;
    const adaptive = this.MAX_DEPTH - Math.floor(this.moves / dropEvery);
    return Math.max(4, adaptive);
  }

  // ======== doMove và evaluate (cốt lõi) ========
  doMove(p) {
    if (this.board[p].z !== this.BLANK_VALUE) return false;
    this.board[p].z = this.player + 1; // 1 hoặc 2
    this.player = 1 - this.player;
    this.moves++;
    this.evaluate(p);
    this.lastMove = p;
    return true;
  }

  // Bảng K: generate cho 2 người chơi
  gen() {
    // Biến static trong C# chuyển thành biến cục bộ trong phạm vi hàm
    const comb = new Array(10).fill(0);
    const n = new Array(4).fill(0);
    let ind = 0;

    const gen2 = (pos) => {
      if (pos === 9) {
        let a1 = 0;
        let a2 = 0;
        if (comb[4] === 0) {
          let n1 = n[1];
          let n2 = n[2];
          let n3 = n[3];
          let pb = 0;
          let pe = 4;
          while (pe !== 9) {
            if (n3 === 0) {
              if (n2 === 0) {
                let s = 0;
                if (comb[pb] === 0 && comb[pe + 1] < 2 && pb !== 4) {
                  s++;
                  if (comb[pe] === 0 && pe !== 4) s++;
                }
                const pri = this.priority[n1][s];
                if (a1 < pri) a1 = pri;
              }
              if (n1 === 0) {
                let s = 0;
                if (comb[pb] === 0 && (comb[pe + 1] & 1) === 0 && pb !== 4) {
                  s++;
                  if (comb[pe] === 0 && pe !== 4) s++;
                }
                const pri = this.priority[n2][s];
                if (a2 < pri) a2 = pri;
              }
            }
            switch (comb[++pe]) {
              case 1:
                n1++;
                break;
              case 2:
                n2++;
                break;
              case 3:
                n3++;
                break;
            }
            switch (comb[pb++]) {
              case 1:
                n1--;
                break;
              case 2:
                n2--;
                break;
              case 3:
                n3--;
                break;
            }
          }
        }
        this.K[0][ind] = a1;
        this.K[1][ind] = a2;
        ind++;
      } else {
        for (let z = 0; z < 4; z++) {
          comb[pos] = z;
          gen2(pos + 1);
        }
      }
    };

    const gen1 = (pos) => {
      if (pos === 5) gen2(pos);
      else {
        for (let z = 0; z < 4; z++) {
          comb[pos] = z;
          n[z]++;
          gen1(pos + 1);
          n[z]--;
        }
      }
    };

    gen1(0);
  }

  // Cập nhật đánh giá trong phạm vi 4 theo 4 hướng xung quanh p0
  evaluate(p0) {
    // Nếu vừa đặt quân tại p0 (z!=0), loại bỏ nó khỏi list tốt và đưa về 0
    if (this.board[p0].z !== this.BLANK_VALUE) {
      for (let k = 0; k < 2; k++) {
        const pr = this.board[p0].h[k];
        if (pr.pv !== 0) {
          if (pr.i !== 0) {
            this.board[pr.nxt].h[k].pre = pr.pre;
            if (pr.pre !== 0) this.board[pr.pre].h[k].nxt = pr.nxt;
            else this.goodMoves[pr.i][k] = pr.nxt;
            pr.i = 0;
          }
          this.sum[k] -= pr.pv;
          pr.pv = pr.ps0 = pr.ps1 = pr.ps2 = pr.ps3 = 0;
        }
      }
    }

    for (let i = 0; i < 4; i++) {
      const s = this.diroff[i];
      let pk1 = p0 + s * 5;
      let pe = p0;
      let p = p0;

      // Dịch pe về phía trái tối đa 4 ô (nếu gặp tường thì nhảy)
      for (let m = 4; m > 0; m--) {
        p -= s;
        if (this.board[p].z === this.WALL_VALUE) {
          pe += s * m;
          p += s;
          break;
        }
      }

      // Xây pattern 9 ô liên tiếp bắt đầu từ pe lùi về 8 lần
      let pattern = 0;
      let qk = pe - s * 9;
      for (let q = pe; q !== qk; q -= s) {
        pattern = (pattern << 2) | this.board[q].z; // pattern*=4; + z
      }

      // Duyệt từ p đến pk1 (tối đa 5 bước)
      while (this.board[p].z !== this.WALL_VALUE) {
        if (this.board[p].z === this.BLANK_VALUE) {
          for (let k = 0; k < 2; k++) {
            const pr = this.board[p].h[k];
            const h = this.K[k][pattern];
            // thay ps theo hướng i
            let old;
            switch (i) {
              case 0:
                old = pr.ps0;
                pr.ps0 = h;
                break;
              case 1:
                old = pr.ps1;
                pr.ps1 = h;
                break;
              case 2:
                old = pr.ps2;
                pr.ps2 = h;
                break;
              case 3:
                old = pr.ps3;
                pr.ps3 = h;
                break;
              default:
                old = 0;
            }
            let m = h - old;
            if (m !== 0) {
              this.sum[k] += m;
              pr.pv += m;

              // Xác định list theo pv
              let ind = 0;
              if (pr.pv >= this.H21) {
                ind++;
                if (pr.pv >= 2 * this.H21) {
                  ind++;
                  if (pr.pv >= this.H4) ind++;
                }
              }

              // Chuyển ô này sang list ind
              if (ind !== pr.i) {
                // bỏ khỏi list cũ
                if (pr.i !== 0) {
                  this.board[pr.nxt].h[k].pre = pr.pre;
                  if (pr.pre !== 0) this.board[pr.pre].h[k].nxt = pr.nxt;
                  else this.goodMoves[pr.i][k] = pr.nxt;
                }
                // thêm vào list mới
                if ((pr.i = ind) !== 0) {
                  const q = (pr.nxt = this.goodMoves[ind][k]);
                  this.goodMoves[ind][k] = this.board[q].h[k].pre = p;
                  pr.pre = 0;
                }
              }
            }
          }
        }
        p += s;
        if (p === pk1) break;
        // xoay pattern sang phải 2 bit, nạp thêm 2 bit mới từ bên trái
        pe += s;
        pattern = (pattern >>> 2) | (this.board[pe].z << 16);
      }
    }
  }

  // ======== Thuật toán chính (port y nguyên) ========
  alfabeta(player1, UcurMoves, logWin, last, strike) {
    let p, q, t, defendMoves1, defendMoves2, UwinMoves0;
    let y = 0,
      m = 0;
    let i, j, s;
    let pr, hr;
    let mustDefend, mustAttack;

    // nếu đã có 4 liên tiếp => thắng ngay
    p = this.goodMoves[3][player1];
    if (p !== 0) {
      if (logWin !== 0 && (strike & 1) !== 0) this.winMoves1[this.UwinMoves++] = p;
      return 1000 - this.dpth;
    }
    const player2 = 1 - player1;
    p = this.goodMoves[3][player2];
    if (p !== 0) {
      this.board[p].z = player1 + 1;
      this.evaluate(p);
      if ((strike & 1) !== 0) y = -this.alfabeta(player2, UcurMoves, logWin, last, 2);
      else y = -this.alfabeta(player2, UcurMoves, logWin, last, 1);
      this.board[p].z = 0;
      this.evaluate(p);
      if (logWin !== 0 && y !== 0 && y > 0 === ((strike & 1) !== 0)) this.winMoves1[this.UwinMoves++] = p;
      return y;
    }

    // gom các nước tốt vào curMoves
    const Utahy0 = UcurMoves;
    hr = (strike & 1) === 0 ? player2 : player1;
    mustDefend = mustAttack = 0;
    p = this.goodMoves[2][player1];
    if (p !== 0) {
      mustAttack++;
      do {
        if (logWin === 0 && this.board[p].h[player1].pv >= this.H31) {
          if (this.dpth === 0) this.bestMove = p;
          return 999 - this.dpth;
        }
        if (UcurMoves === this.McurMoves) break;
        pr = this.board[p].h[hr].pv;
        for (q = UcurMoves++; q > Utahy0 && this.board[this.curMoves[q - 1]].h[hr].pv < pr; q--) {
          this.curMoves[q] = this.curMoves[q - 1];
        }
        this.curMoves[q] = p;
        p = this.board[p].h[player1].nxt;
      } while (p !== 0);
    }

    defendMoves1 = UcurMoves;
    for (p = this.goodMoves[2][player2]; p !== 0; p = this.board[p].h[player2].nxt) {
      if (this.board[p].h[player2].pv >= this.H30 + this.H21) {
        if (mustDefend === 0) mustDefend = 1;
        if (this.board[p].h[player2].pv >= this.H31) mustDefend = 2;
      } else {
        if (mustAttack !== 0) continue;
      }
      if (UcurMoves === this.McurMoves) break;
      pr = this.board[p].h[hr].pv;
      for (q = UcurMoves++; q > defendMoves1 && this.board[this.curMoves[q - 1]].h[hr].pv < pr; q--) {
        this.curMoves[q] = this.curMoves[q - 1];
      }
      this.curMoves[q] = p;
    }
    defendMoves2 = UcurMoves;

    if (this.dpth < this.depth) {
      if (strike < 2 && last !== 0) {
        for (let i = 0; i < 8; i++) {
          s = this.diroff[i];
          p = last + s;
          for (let j = 0; j < 4 && this.board[p].z !== this.WALL_VALUE; j++, p += s) {
            if (
              ((strike & 1) === 0 &&
                this.board[p].h[player2].i === 1 &&
                (mustAttack === 0 || this.board[p].h[player2].pv >= this.H30)) ||
              (this.board[p].h[player1].i === 1 && (mustDefend === 0 || this.board[p].h[player1].pv >= this.H30))
            ) {
              if (UcurMoves < this.McurMoves) {
                pr = this.board[p].h[hr].pv;
                for (q = UcurMoves++; q > defendMoves2 && this.board[this.curMoves[q - 1]].h[hr].pv < pr; q--) {
                  this.curMoves[q] = this.curMoves[q - 1];
                }
                this.curMoves[q] = p;
              }
            }
          }
        }
      } else {
        // phòng thủ
        if (strike === 2 && mustDefend < 2) {
          for (p = this.goodMoves[1][player2]; p !== 0; p = this.board[p].h[player2].nxt) {
            if (UcurMoves === this.McurMoves) break;
            if (
              (last === 0 || this.distance(p, last) < this.D[mustDefend]) &&
              (mustAttack === 0 || this.board[p].h[player2].pv >= this.H30)
            ) {
              if (UcurMoves === this.McurMoves) break;
              pr = this.board[p].h[hr].pv;
              for (q = UcurMoves++; q > defendMoves2 && this.board[this.curMoves[q - 1]].h[hr].pv < pr; q--) {
                this.curMoves[q] = this.curMoves[q - 1];
              }
              this.curMoves[q] = p;
            }
          }
          defendMoves2 = UcurMoves;
        }
        // tấn công
        for (p = this.goodMoves[1][player1]; p !== 0; p = this.board[p].h[player1].nxt) {
          if (UcurMoves === this.McurMoves) break;
          if (
            (last === 0 || this.distance(p, last) < 7) &&
            (mustDefend === 0 || this.board[p].h[player1].pv >= this.H30)
          ) {
            if (UcurMoves === this.McurMoves) break;
            pr = this.board[p].h[hr].pv;
            for (q = UcurMoves++; q > defendMoves2 && this.board[this.curMoves[q - 1]].h[hr].pv < pr; q--) {
              this.curMoves[q] = this.curMoves[q - 1];
            }
            this.curMoves[q] = p;
          }
        }
      }
    }

    if (Utahy0 === UcurMoves) return 0;

    // đánh giá các nước tốt và chọn tốt nhất
    UwinMoves0 = this.UwinMoves;
    m = -0x7ffe;
    for (t = Utahy0; t < UcurMoves; t++) {
      this.dpth++;
      p = this.curMoves[t];
      // thực hiện nước đi
      this.board[p].z = player1 + 1;
      this.evaluate(p);
      // đệ quy
      if ((strike & 1) !== 0) {
        if (t >= defendMoves2 || t < defendMoves1) y = -this.alfabeta(1 - player1, UcurMoves, logWin, p, 0);
        else y = -this.alfabeta(1 - player1, UcurMoves, logWin, last, 2);
      } else {
        y = -this.alfabeta(1 - player1, UcurMoves, logWin, last, 1);
      }
      // revert
      this.board[p].z = 0;
      this.evaluate(p);
      this.dpth--;

      if (y > 0) {
        if (this.dpth === 0) this.bestMove = p;
        if (logWin !== 0 && (strike & 1) !== 0) this.winMoves1[this.UwinMoves++] = p;
        return y;
      }
      if (y === 0) {
        if ((strike & 1) === 0) {
          this.UwinMoves = UwinMoves0;
          if (this.dpth === 0) this.bestMove = p;
          return y;
        }
        m = y;
      } else if (y >= m) {
        if (logWin !== 0 && (strike & 1) === 0) {
          this.winMoves1[this.UwinMoves++] = p;
          logWin = 0;
        }
        if (this.dpth === 0) {
          if (y > m || this.board[p].h[player2].pv > this.board[this.bestMove].h[player2].pv) this.bestMove = p;
        }
        m = y;
      }
    }
    return m;
  }

  alfabetaEntry(strike, player1, logWin, last) {
    return this.alfabeta(player1, 0, logWin, last, strike);
  }

  try4_dir(player1, last) {
    let i, j, s;
    let p,
      p2 = 0,
      y = 0;
    p = this.goodMoves[3][player1];
    if (p !== 0) {
      this.winMoves1[this.UwinMoves++] = p;
      return p;
    }
    const player2 = 1 - player1;
    for (let idx = 0; idx < 8; idx++) {
      s = this.diroff[idx];
      p = last + s;
      for (j = 0; j < 4 && this.board[p].z !== this.WALL_VALUE; j++, p += s) {
        if (this.board[p].h[player1].pv >= this.H30) {
          this.board[p].z = player1 + 1;
          this.evaluate(p);
          if (this.goodMoves[3][player2] === 0) {
            p2 = this.goodMoves[3][player1];
            if (p2 !== 0) {
              this.board[p2].z = 2 - player1;
              this.evaluate(p2);
              y = this.try4_dir(player1, p);
              this.board[p2].z = 0;
              this.evaluate(p2);
            }
          }
          this.board[p].z = 0;
          this.evaluate(p);
          if (y !== 0) {
            this.winMoves1[this.UwinMoves++] = p2;
            this.winMoves1[this.UwinMoves++] = p;
            return p;
          }
        }
      }
    }
    return 0;
  }

  try4(player1) {
    let p,
      p2,
      y = 0,
      t;
    let j;
    this.UwinMoves = 0;
    t = 0;
    for (j = 1; j <= 2; j++) {
      for (p = this.goodMoves[j][player1]; p !== 0; p = this.board[p].h[player1].nxt) {
        if (this.board[p].h[player1].pv >= this.H30) {
          if (t === this.McurMoves) break;
          this.curMoves[t++] = p;
        }
      }
    }
    for (t--; t >= 0; t--) {
      p = this.curMoves[t];
      this.board[p].z = player1 + 1;
      this.evaluate(p);
      if (this.goodMoves[3][1 - player1] === 0) {
        p2 = this.goodMoves[3][player1];
        if (p2 !== 0) {
          this.board[p2].z = 2 - player1;
          this.evaluate(p2);
          y = this.try4_dir(player1, p);
          this.board[p2].z = 0;
          this.evaluate(p2);
        }
        this.board[p].z = 0;
        this.evaluate(p);
        if (y !== 0) {
          this.winMoves1[this.UwinMoves++] = p2;
          this.winMoves1[this.UwinMoves++] = p;
          return p;
        }
      }
    }
    return 0;
  }

  getEvalFor(player1, p0) {
    let i, s, y, c1, c2, n;
    let p;
    y = 0;
    c1 = c2 = 0;
    for (i = 0; i < 8; i++) {
      s = this.diroff[i];
      p = p0 + s;
      if (this.board[p].z === player1 + 1) c1++;
      if (this.board[p].z === 2 - player1) c2++;
    }
    n = 0;
    if (this.board[p0].h[player1].ps0 < 2) n++;
    if (this.board[p0].h[player1].ps1 < 2) n++;
    if (this.board[p0].h[player1].ps2 < 2) n++;
    if (this.board[p0].h[player1].ps3 < 2) n++;
    if (n > 2) y -= 8;
    if (c1 + c2 === 0) y -= 20;
    if (c2 === 0 && c1 > 0 && this.board[p0].h[player1].pv > 9) {
      y += (c1 + 1) * 5;
    }
    if (this.board[p0].h[1 - player1].pv < 5) {
      n = 0;
      if (this.board[p0].h[player1].ps0 >= this.H12) n++;
      if (this.board[p0].h[player1].ps1 >= this.H12) n++;
      if (this.board[p0].h[player1].ps2 >= this.H12) n++;
      if (this.board[p0].h[player1].ps3 >= this.H12) n++;
      y += 15;
      if (n > 1) y += n * 64;
    }
    return y + this.board[p0].h[player1].pv;
  }

  getEval(p) {
    const a = this.getEvalFor(0, p);
    const b = this.getEvalFor(1, p);
    return a > b ? a + (b >> 1) : (a >> 1) + b;
  }

  defend(player1) {
    let p, t;
    let m, mv, mh, y, yh, Nwins;
    const player2 = 1 - player1;
    let th,
      thm = 0;

    this.dpth++;
    Nwins = this.UwinMoves;
    // tính điểm các ô trong winMoves1
    for (t = this.UwinMoves - 1, th = Nwins - 1; t !== -1; t--, th--) {
      this.winEval[th] = this.getEvalFor(player2, this.winMoves1[t]);
    }

    mh = m = -0x7ffe;
    for (let i = 0; Nwins > 0 && i < 20; i++) {
      mv = -0x7ffe;
      for (th = Nwins - 1; th !== -1; th--) {
        if (this.winEval[th] > mv) {
          thm = th;
          mv = this.winEval[th];
        }
      }
      if (mv < 25) break;
      const j = thm;
      p = this.winMoves1[j];
      Nwins--;
      this.winMoves1[j] = this.winMoves1[Nwins];

      this.board[p].z = player1 + 1;
      this.evaluate(p);
      y = -this.alfabetaEntry(3, player2, 0, 0);
      this.board[p].z = 0;
      this.evaluate(p);
      yh = this.winEval[thm] + y * 20;
      if (yh > mh) {
        m = y;
        mh = yh;
        this.bestMove = p;
        if (y > 0 || (y === 0 && this.winMove[this.player][player1] === 0)) break;
      }
      this.winEval[thm] = this.winEval[Nwins];
    }

    if (m < 0) {
      // nếu sắp thua, thử tấn công
      t = 0;
      for (p = this.goodMoves[1][player1]; p !== 0; p = this.board[p].h[player1].nxt) {
        if (this.board[p].h[player1].pv >= this.H30) {
          if (t === this.MwinMoves) break;
          this.winMoves1[t++] = p;
        }
      }
      for (t--; t >= 0; t--) {
        p = this.winMoves1[t];
        this.board[p].z = player1 + 1;
        this.evaluate(p);
        y = -this.alfabetaEntry(3, player2, 0, 0);
        this.board[p].z = 0;
        this.evaluate(p);
        if (y > m) {
          m = y;
          this.bestMove = p;
          if (y >= 0) break;
        }
      }
    }

    this.dpth--;
    return m;
  }

  findMax(player1) {
    let p, t;
    let m, r;
    m = -1;
    t = 0;
    for (let i = 2; i > 0 && t === 0; i--) {
      for (let k = 0; k < 2; k++) {
        for (p = this.goodMoves[i][k]; p !== 0; p = this.board[p].h[k].nxt) {
          r = this.getEval(p);
          if (r > m) {
            m = r;
            t = p;
          }
        }
      }
    }
    return t;
  }

  lookAhead(player1) {
    // trả về điểm dự đoán
    let p;
    let y;
    if (this.goodMoves[3][player1] !== 0) return 500;
    const player2 = 1 - player1;
    p = this.goodMoves[3][player2];
    if (p === 0 && this.dpth < 4) p = this.findMax(player1);
    if (p === 0) return (this.sum[player1] - this.sum[player2]) / 3;

    this.dpth++;
    this.board[p].z = player1 + 1;
    this.evaluate(p);
    y = -this.lookAhead(player2);
    this.board[p].z = 0;
    this.evaluate(p);
    this.dpth--;
    return y;
  }

  computer1() {
    let p;
    let Nresults = 0;
    let m,
      y = 0,
      rnd;
    let r;
    const player1 = this.player;
    const player2 = 1 - player1;

    // Nước đầu: vào giữa
    if (this.moves === 0) {
      this.doMove((Math.floor(this.width / 2) + 6) * this.height2 + Math.floor(this.height / 2) + 1);
      return;
    }

    // Nước thứ 2: ngẫu nhiên hàng xóm hợp lệ
    if (this.moves === 1) {
      while (true) {
        const rndDir = Math.floor(Math.random() * 4);
        switch (rndDir) {
          case 0:
            if (this.doMove(this.lastMove + 1)) return;
            break;
          case 1:
            if (this.doMove(this.lastMove - 1)) return;
            break;
          case 2:
            if (this.doMove(this.lastMove + this.height2)) return;
            break;
          case 3:
            if (this.doMove(this.lastMove - this.height2)) return;
            break;
          default:
            break;
        }
      }
    }

    this.lastMove = -1;

    // Thắng ngay nếu có 4 liên tiếp
    if (this.doMove(this.goodMoves[3][player1])) return;
    if (this.doMove(this.goodMoves[3][player2])) return; // chặn ngay

    // Thử ép 4
    this.bestMove = 0;
    if (this.doMove(this.try4(player1))) return;

    // Giả sử đối thủ ép 4
    p = this.try4(player2);
    if (p !== 0) {
      this.winMove[player1][player2] = p;
      y = 1;
    } else {
      this.bestMove = 0;
      if (this.winMove[player1][player1] !== 0) {
        y = this.alfabetaEntry(1, player1, 0, this.winMove[player1][player1]);
        if (y <= 0) this.winMove[player1][player1] = 0;
      }
      if (this.bestMove === 0) y = this.alfabetaEntry(3, player1, 0, 0);
      if (y > 0 && this.bestMove !== 0) {
        this.doMove(this.bestMove);
        this.winMove[player1][player1] = this.bestMove;
        return;
      }
      y = 0;
      if (this.winMove[player1][player2] !== 0) {
        this.UwinMoves = 0;
        y = this.alfabetaEntry(1, player2, 1, this.winMove[player1][player2]);
        if (y <= 0) this.winMove[player1][player2] = 0;
      }
      if (y <= 0) {
        this.UwinMoves = 0;
        y = this.alfabetaEntry(3, player2, 1, 0);
        if (y > 0) this.winMove[player1][player2] = this.bestMove;
      }
    }

    this.bestMove = 0;

    if (y > 0) {
      if (this.UwinMoves > 0) {
        this.defend(player1);
      }
      if (this.bestMove === 0) this.alfabetaEntry(2, player1, 0, 0);
    }

    if (this.bestMove === 0 && this.moves > 9) {
      m = -0x7ffffffe;
      for (p = 0; p < this.boardk; p++) {
        if (this.board[p].z === 0 && (this.board[p].h[0].pv > 10 || this.board[p].h[1].pv > 10)) {
          r = this.getEval(p);
          this.board[p].z = player1 + 1;
          this.evaluate(p);
          r -= this.lookAhead(player2);
          this.board[p].z = 0;
          this.evaluate(p);
          if (r > m) {
            m = r;
            this.bestMove = p;
            Nresults = 1;
          } else if (r > m - 20) {
            Nresults++;
            if (Math.floor(Math.random() * Nresults) === 0) this.bestMove = p;
          }
        }
      }
    }

    if (this.bestMove === 0) {
      m = -1;
      for (p = 0; p < this.boardk; p++) {
        if (this.board[p].z === 0) {
          r = this.getEval(p);
          if (r > m) m = r;
        }
      }
      rnd = Math.floor(m / 12);
      if (rnd > 30) rnd = 30;
      Nresults = 0;
      for (p = 0; p < this.boardk; p++) {
        if (this.board[p].z === 0) {
          if (this.getEval(p) >= m - rnd) {
            Nresults++;
            if (Math.floor(Math.random() * Nresults) === 0) this.bestMove = p;
          }
        }
      }
    }

    this.doMove(this.bestMove);
  }
}

export default MasterCaro;
