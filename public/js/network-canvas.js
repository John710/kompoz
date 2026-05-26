const NetworkCanvas = (() => {
  const svg = d3.select('#networkSvg');
  const container = svg.append('g').attr('class', 'container');
  const gridGroup = container.append('g').attr('class', 'grid');
  const edgesGroup = container.append('g').attr('class', 'edges');
  const nodesGroup = container.append('g').attr('class', 'nodes');

  let width = 0, height = 0;
  let zoomTransform = d3.zoomIdentity;
  let tool = 'pan';
  let nodes = [], edges = [];
  let selectedNodeId = null;
  let linkSourceId = null;
  let callbacks = {};
  const NODE_W = 160, NODE_H = 64;

  function init(cb) {
    callbacks = cb || {};
    const wrapper = document.querySelector('.canvas-wrapper');
    width = wrapper.clientWidth;
    height = wrapper.clientHeight;
    svg.attr('viewBox', `0 0 ${width} ${height}`);

    const zoom = d3.zoom()
      .scaleExtent([0.2, 4])
      .on('zoom', (e) => {
        zoomTransform = e.transform;
        container.attr('transform', e.transform);
      });
    svg.call(zoom).on('dblclick.zoom', null);

    svg.on('click', (e) => {
      if (e.target.id === 'networkSvg') {
        selectNode(null);
        if (tool === 'link') cancelLink();
      }
    });

    drawGrid();
    window.addEventListener('resize', () => {
      width = wrapper.clientWidth;
      height = wrapper.clientHeight;
      svg.attr('viewBox', `0 0 ${width} ${height}`);
      drawGrid();
    });
  }

  function setTool(t) {
    tool = t;
    svg.style('cursor', tool === 'pan' ? 'grab' : 'default');
    if (tool !== 'link') cancelLink();
  }

  function drawGrid() {
    const gridSize = 40;
    const cols = Math.ceil(width / gridSize) + 2;
    const rows = Math.ceil(height / gridSize) + 2;
    gridGroup.selectAll('*').remove();
    for (let i = -1; i < cols; i++) {
      gridGroup.append('line')
        .attr('x1', i * gridSize).attr('y1', -gridSize)
        .attr('x2', i * gridSize).attr('y2', rows * gridSize)
        .attr('stroke', 'var(--border)').attr('stroke-width', 0.5).attr('stroke-opacity', 0.3);
    }
    for (let j = -1; j < rows; j++) {
      gridGroup.append('line')
        .attr('x1', -gridSize).attr('y1', j * gridSize)
        .attr('x2', cols * gridSize).attr('y2', j * gridSize)
        .attr('stroke', 'var(--border)').attr('stroke-width', 0.5).attr('stroke-opacity', 0.3);
    }
  }

  function render(dataNodes, dataEdges) {
    nodes = dataNodes;
    edges = dataEdges;
    renderEdges();
    renderNodes();
  }

  function renderEdges() {
    const link = edgesGroup.selectAll('.network-edge').data(edges, d => d.id);
    link.exit().remove();
    const linkEnter = link.enter().append('g').attr('class', 'network-edge');
    linkEnter.append('line').attr('class', 'edge-line');
    linkEnter.append('text').attr('class', 'edge-label').attr('text-anchor', 'middle').attr('dy', -4);
    const linkMerge = linkEnter.merge(link);
    linkMerge.select('.edge-line')
      .attr('x1', d => (getNode(d.source_id)?.x || 0) + NODE_W / 2)
      .attr('y1', d => (getNode(d.source_id)?.y || 0) + NODE_H / 2)
      .attr('x2', d => (getNode(d.target_id)?.x || 0) + NODE_W / 2)
      .attr('y2', d => (getNode(d.target_id)?.y || 0) + NODE_H / 2);
    linkMerge.select('.edge-label')
      .attr('x', d => {
        const sx = (getNode(d.source_id)?.x || 0) + NODE_W / 2;
        const tx = (getNode(d.target_id)?.x || 0) + NODE_W / 2;
        return (sx + tx) / 2;
      })
      .attr('y', d => {
        const sy = (getNode(d.source_id)?.y || 0) + NODE_H / 2;
        const ty = (getNode(d.target_id)?.y || 0) + NODE_H / 2;
        return (sy + ty) / 2;
      })
      .text(d => d.label || '');
  }

  function renderNodes() {
    const node = nodesGroup.selectAll('.network-node').data(nodes, d => d.id);
    node.exit().remove();
    const nodeEnter = node.enter().append('g').attr('class', 'network-node')
      .attr('transform', d => `translate(${d.x || 0},${d.y || 0})`)
      .on('mousedown', (e, d) => {
        if (tool === 'select' || tool === 'link') e.stopPropagation();
        if (tool === 'select') selectNode(d.id);
        if (tool === 'link') {
          if (!linkSourceId) { linkSourceId = d.id; highlightNode(d.id, true); }
          else if (linkSourceId !== d.id) {
            if (callbacks.onCreateLink) callbacks.onCreateLink(linkSourceId, d.id);
            cancelLink();
          }
        }
      })
      .on('contextmenu', (e, d) => {
        e.preventDefault();
        if (callbacks.onContextMenu) callbacks.onContextMenu(e, d);
      })
      .call(d3.drag()
        .on('start', function(e, d) {
          if (tool !== 'pan') { e.sourceEvent.stopPropagation(); }
          d3.select(this).raise();
        })
        .on('drag', function(e, d) {
          if (tool !== 'pan') return;
          d.x = (d.x || 0) + e.dx / zoomTransform.k;
          d.y = (d.y || 0) + e.dy / zoomTransform.k;
          d3.select(this).attr('transform', `translate(${d.x},${d.y})`);
          renderEdges();
        })
        .on('end', function(e, d) {
          if (tool === 'pan' && callbacks.onNodeMove) callbacks.onNodeMove(d);
        })
      );

    const card = nodeEnter.append('g').attr('class', 'node-card');
    card.append('rect').attr('width', NODE_W).attr('height', NODE_H).attr('rx', 8)
      .attr('fill', 'var(--panel)').attr('stroke', 'var(--border)').attr('stroke-width', 1);
    card.append('rect').attr('width', 4).attr('height', NODE_H).attr('rx', 2)
      .attr('fill', d => d.online ? 'var(--green)' : 'var(--red)');
    card.append('svg:foreignObject').attr('x', 12).attr('y', 16).attr('width', 32).attr('height', 32)
      .append('xhtml:div').style('width', '32px').style('height', '32px').style('color', 'var(--accent)')
      .html(d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">${NetworkIcons.get(d.device_type || 'unknown')}</svg>`);
    card.append('text').attr('x', 52).attr('y', 26).attr('class', 'node-name')
      .attr('fill', 'var(--text)').attr('font-size', '13px').attr('font-weight', '600')
      .text(d => d.name || d.ip || 'Unknown');
    card.append('text').attr('x', 52).attr('y', 44).attr('class', 'node-ip')
      .attr('fill', 'var(--muted)').attr('font-size', '11px').attr('font-family', 'JetBrains Mono, monospace')
      .text(d => d.ip || '');
    card.append('circle').attr('cx', NODE_W - 12).attr('cy', 12).attr('r', 4)
      .attr('fill', d => d.online ? 'var(--green)' : 'var(--red)')
      .attr('stroke', 'var(--panel)').attr('stroke-width', 2);

    nodeEnter.merge(node).attr('class', d => 'network-node' + (d.id === selectedNodeId ? ' selected' : ''));
  }

  function getNode(id) { return nodes.find(n => n.id === id); }
  function selectNode(id) {
    selectedNodeId = id;
    renderNodes();
    if (callbacks.onSelectNode) callbacks.onSelectNode(id ? getNode(id) : null);
  }
  function highlightNode(id, on) {
    nodesGroup.selectAll('.network-node').filter(d => d.id === id)
      .select('.node-card rect:first-child').attr('stroke', on ? 'var(--accent)' : 'var(--border)');
  }
  function cancelLink() { linkSourceId = null; highlightNode(null, false); }

  function zoomIn() { svg.transition().duration(200).call(d3.zoom().transform, zoomTransform.scale(1.2)); }
  function zoomOut() { svg.transition().duration(200).call(d3.zoom().transform, zoomTransform.scale(0.833)); }
  function zoomFit() {
    if (!nodes.length) return;
    const xs = nodes.map(n => n.x || 0), ys = nodes.map(n => n.y || 0);
    const minX = Math.min(...xs), maxX = Math.max(...xs) + NODE_W;
    const minY = Math.min(...ys), maxY = Math.max(...ys) + NODE_H;
    const dx = maxX - minX, dy = maxY - minY;
    const scale = Math.min(width / dx, height / dy, 1) * 0.9;
    const tx = (width - dx * scale) / 2 - minX * scale;
    const ty = (height - dy * scale) / 2 - minY * scale;
    svg.transition().duration(400).call(d3.zoom().transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  }

  return { init, render, setTool, selectNode, zoomIn, zoomOut, zoomFit, getNode, nodes: () => nodes, edges: () => edges };
})();
