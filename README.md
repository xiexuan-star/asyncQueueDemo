## webpack5任务调度器的实现

### 1 概念

同一时间对多个任务进行分配(编排)

2个关键属性:

处理器函数/并发数

### 2 webpack中对AsyncQueue实例的使用

通过asyncQueue初始化compilation中的实例属性

### 3 基本用法

```javascript
const AsyncQueue = require('webpack/lib/util/AsyncQueue');

/**
 *
 * 处理器函数
 * @param {*} item 需要传入里的item
 * @param {*} callback 表示处理器完成的callback
 */
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
  console.log('item2处理后的结果');
});

queue.add({ key: 'item3' }, (err, result) => {
  console.log('item3处理后的结果');
});

// 2s后输出item1/item2 4s后输出item3

// 当key重复,那么当第一个key对应的任务结束后
// 会将这个任务的结果直接给到后续的同key任务
```

### 4 implements

当调用add时,通过_willEnsureProcessing防止一次EventLoop中多次执行队列表用函数

在本次EventLoop中收集入队任务
