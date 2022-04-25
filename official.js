const ENTRY_STATE = {
  PENDING: 0,
  PROCESSING: 1,
  DONE: 2
};

class AsyncQueueEntry {
  /**
   * @param {any} item
   * @param {Function} callback
   */
  constructor(item, callback) {
    /**
     * @description 保存Task的处理值
     */
    this.item = item;
    /**
     * @description 初始化状态
     */
    this.state = ENTRY_STATE.PENDING;
    /**
     * @description 保存Task的完成函数
     */
    this.callback = callback;
    /**
     * @description 用于重复Task的处理
     */
    this.callbacks = undefined;
    /**
     * @description 用于保存任务处理的结果
     */
    this.result = undefined;
    /**
     * @description 用于保存任务处理的错误
     */
    this.error = undefined;
  }
}

/**
 * @typedef AsyncQueueOptions
 * @property {string} name 名称
 * @property {Function} processor 处理函数
 * @property {number} parallelism 并发数量
 * @property {Function} getKey 唯一Key
 */

class AsyncQueue {
  /**
   * @param {AsyncQueueOptions} options
   */
  constructor({ name, processor, getKey, parallelism }) {
    this.name = name;
    this.processor = processor;
    this.getKey = getKey;
    this.parallelism = parallelism || 100;

    /**
     * @description 当前队列中等待执行的任务
     * @type {ArrayQueue}
     * @private
     */
    this._queued = new ArrayQueue();
    /**
     * @description 当前队列中所有执行过的任务,用于去重
     * @type {Map<any, AsyncQueueEntry>}
     * @private
     */
    this._entries = new Map();
    /**
     * @description 当前并发的任务
     * @type {number}
     * @private
     */
    this._activeTasks = 0;

    /**
     * @description 是否开启下次事件队列EventLoop中等待执行的函数,避免重复调用
     * @type {boolean}
     * @private
     */
    this._willEnsureProcessing = false;
    /**
     * @description 队列是否结束
     * @type {boolean}
     * @private
     */
    this._stopped = false;
  }

  add(item, callback) {
    if (this._stopped) return callback(new Error('Queue was stopped'));
    const key = this.getKey(item);
    if (this._entries.has(key)) {
      const entry = this._entries.get(key);
      if (entry.state === ENTRY_STATE.DONE) {
        // 如果缓存中的entry已经执行完毕,那么直接执行即可
        setTimeout(() => {
          entry.callback(entry.error, entry.result);
        });
        // 否则,推入该entry的callbacks
      } else if (!entry.callbacks) {
        entry.callbacks = [callback];
      } else {
        entry.callbacks.push(callback);
      }
      return;
    }
    // 创建一个entry对象
    const newEntry = new AsyncQueueEntry(item, callback);
    // 缓存
    this._entries.set(key, newEntry);
    // 入队
    this._queued.enqueue(newEntry);

    // _willEnsureProcessing为false表示下次EventLoop中不会调用调用器执行任务
    // 需要在下一次EventLoop中执行调度器任务
    // 将值设为true 防护本次EventLoop多次add导致重复执行
    if (!this._willEnsureProcessing) {
      this._willEnsureProcessing = true;
      // 下一次EventLoop调用
      setTimeout(this._ensureProcessing.bind(this));
    }
  }

  // 迭代队列执行
  _ensureProcessing() {
    // 每次宏任务中的add,由于_willEnsureProcessing的锁定,只会开启一个循环
    // 达到并发上限后, 终止当前轮次的Loop
    // 在_startProcess中,会将activeTasks--,然后开启下一次的Loop
    while (this._activeTasks < this.parallelism) {
      // 获取任务
      const entry = this._queued.dequeue();
      if (!entry) break;
      this._activeTasks++;
      // 修改状态
      entry.state = ENTRY_STATE.PENDING;
      // 该函数的调用是同步的
      // 但是activeTasks--是否异步取决于处理器
      this._startProcess(entry);
    }
    // 解锁,该行为只会发生在当前轮次的Loop全部推入执行完毕之后
    this._willEnsureProcessing = false;
  }

  /**
   * @param {AsyncQueueEntry} entry
   * @private
   */
  _startProcess(entry) {
    this.processor(entry.item, (e, r) => {
      if (e) {
        this._handlerResult(entry, new Error(`AsyncQueue(${this.name} processor error)`), undefined);
      }
      this._handlerResult(entry, e, r);
    });
  }

  /**
   * @description 由processor控制执行
   * @param {AsyncQueueEntry} entry
   * @param {null|Error}e
   * @param {?any} r
   * @private
   */
  _handlerResult(entry, e, r) {
    const callback = entry.callback;
    entry.state = ENTRY_STATE.DONE;
    entry.callback = undefined;
    entry.result = r;
    entry.error = e;
    this._activeTasks--;
    // 触发控制器回调
    callback(e, r);
    // 如果有同Key的Task被调度,那么会被缓存至最先创建的entry中然后一并执行
    if (entry.callbacks) {
      entry.callbacks.forEach(cb => cb(e, r));
    }
    // 调度器任务完成,如果下一次EventLoop没有安排调度器执行
    // 重置this._willEnsureProcessing状态, 并开启调度器执行
    if (!this._willEnsureProcessing) {
      this._willEnsureProcessing = true;
      setTimeout(this._ensureProcessing);
    }
  }
}

class ArrayQueue {
  constructor(items) {
    /**
     * @type {AsyncQueueEntry[]}
     */
    this._list = items ? Array.from(items) : [];
  }

  enqueue(item) {
    this._list.push(item);
  }

  dequeue() {
    return this._list.shift();
  }
}
