class AsyncQueue {
  interval = null;
  cache = new Map();
  queue = [];
  _willEnsureProcessing = 0;

  constructor({ name, processor, parallelism, getKey }) {
    this.name = name;
    this.processor = processor;
    this.parallelism = parallelism;
    this.getKey = getKey;
    this.start();
  }

  start() {
    this.interval = setInterval(() => {
      if (!this.queue.length) return this.stop();
      if (this._willEnsureProcessing >= this.parallelism) return;
      const { value, handler } = this.queue.shift();
      const key = this.getKey(value);
      const cache = this.cache.get(key);
      if (cache) {
        handler(cache.err, cache.result);
        return;
      }
      this._willEnsureProcessing++;
      this.processor(value, (err, result) => {
        this.cache.set(key, { err, result });
        this._willEnsureProcessing--;
        handler(err, result);
      });
    }, 0);
  }

  stop() {
    clearInterval(this.interval);
    this.interval = null;
  }

  add(value, handler) {
    this.queue.push({ value, handler });
    if (!this.interval) {
      this.start();
    }
  }
}

function processor(item, callback) {
  setTimeout(() => {
    item.number = Math.random();
    callback(null, item);
  }, 2000);
}

const queue = new AsyncQueue({
  name: 'addNumber',
  processor,
  /**
   * @property {number} parallelism 最大并发数
   */
  parallelism: 2,
  getKey: (item) => item.key
});

queue.add({ key: 'item1' }, (err, result) => {
  console.log('item1处理后的结果', result);
});

queue.add({ key: 'item2' }, (err, result) => {
  console.log('item2处理后的结果', result);
});

queue.add({ key: 'item3' }, (err, result) => {
  console.log('item3处理后的结果', result);
});
