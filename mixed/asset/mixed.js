$(() => { 
  // jQuery onReady callback
  let app = MixedApp.instance()
});

// short hand for logger class
// so to log something, one could simply use:
// Log.l('action', data);
class L {
  static log() {}
}

class MixedApp {
  constructor() {
    this.kbui = KitBuildUI.instance(MixedApp.canvasId)
    let canvas = this.kbui.canvases.get(MixedApp.canvasId)
    canvas.addToolbarTool(KitBuildToolbar.NODE_CREATE, { priority: 1, direction: false })
    canvas.addToolbarTool(KitBuildToolbar.UNDO_REDO, { priority: 3 })
    canvas.addToolbarTool(KitBuildToolbar.CAMERA, { priority: 4 })
    canvas.addToolbarTool(KitBuildToolbar.UTILITY, { priority: 5, trash: false })
    canvas.addToolbarTool(KitBuildToolbar.LAYOUT, { stack: 'right' })
    canvas.toolbar.render()

    canvas.addCanvasTool(KitBuildCanvasTool.DELETE)
    canvas.addCanvasTool(KitBuildCanvasTool.DUPLICATE)
    canvas.addCanvasTool(KitBuildCanvasTool.EDIT)
    canvas.addCanvasTool(KitBuildCanvasTool.SWITCH)
    canvas.addCanvasTool(KitBuildCanvasTool.DISCONNECT)
    canvas.addCanvasTool(KitBuildCanvasTool.CENTROID)
    canvas.addCanvasTool(KitBuildCanvasTool.CREATE_CONCEPT)
    canvas.addCanvasTool(KitBuildCanvasTool.CREATE_LINK)
    // canvas.addCanvasTool(KitBuildCanvasTool.LOCK) // also UNLOCK toggle

    canvas.addCanvasMultiTool(KitBuildCanvasTool.DELETE)
    canvas.addCanvasMultiTool(KitBuildCanvasTool.DUPLICATE)
    // canvas.addCanvasMultiTool(KitBuildCanvasTool.LOCK)
    // canvas.addCanvasMultiTool(KitBuildCanvasTool.UNLOCK)
    
    this.canvas = canvas
    this.session = Core.instance().session();
    this.ajax = Core.instance().ajax();
    this.runtime = Core.instance().runtime();
    this.config = Core.instance().config();

    // Hack for sidebar-panel show/hide
    // To auto-resize the canvas.
    // AA
    // let observer = new MutationObserver((mutations) => $(`#${MixedApp.canvasId} > div`).css('width', 0))
    // observer.observe(document.querySelector('#admin-sidebar-panel'), {attributes: true})
    // Enable tooltip
    $('[data-bs-toggle="tooltip"]').tooltip({ html: true })

    // Browser lifecycle event
    KitBuildUI.addLifeCycleListener(MixedApp.onBrowserStateChange)

    // Logger
    if (typeof KitBuildLogger != 'undefined') {
      this.logger = KitBuildLogger.instance(null, 0, null, canvas)
        .enable();
      MixedApp.loggerListener = 
        this.logger.onCanvasEvent.bind(this.logger)
      canvas.on("event", MixedApp.loggerListener)
    }

    this.handleEvent();
    this.handleRefresh();
  }

  static instance() {
    MixedApp.inst = new MixedApp()
    return MixedApp.inst;
  }

  setUser(user = null) {
    this.user = user;
  }

  setConceptMap(conceptMap) { console.warn("CONCEPT MAP SET:", conceptMap)
    this.conceptMap = conceptMap
    if (conceptMap) {
      this.canvas.direction = conceptMap.map.direction
      this.session.set('cmid', conceptMap.map.cmid)
      let status = `<span class="mx-2 d-flex align-items-center status-cmap">`
        + `<span class="badge rounded-pill bg-secondary">ID: ${conceptMap.map.cmid}</span>`
        + `<span class="text-secondary ms-2 text-truncate"><small>${conceptMap.map.title}</small></span>`
        + `</span>`
      StatusBar.instance().remove('.status-cmap').prepend(status);
    } else {
      StatusBar.instance().remove('.status-cmap');
      this.session.unset('cmid')
    }
    $('[data-bs-toggle="tooltip"]').tooltip({ html: true })
  }

  setKitMap(kitMap = null) { 
    console.warn("KIT MAP SET:", kitMap)
    this.kitMap = kitMap
    if (kitMap) {
      this.setConceptMap(kitMap.conceptMap)
      this.session.set('kid', kitMap.map.kid)
      let tooltipText = ''
      tooltipText += "FBLV:" + kitMap.parsedOptions.feedbacklevel
      tooltipText += ",FBSV:" + kitMap.parsedOptions.feedbacksave
      tooltipText += ",FFB:" + kitMap.parsedOptions.fullfeedback
      tooltipText += ",LOG:" + kitMap.parsedOptions.log
      tooltipText += ",MOD:" + kitMap.parsedOptions.modification
      tooltipText += ",RD:" + kitMap.parsedOptions.readcontent
      tooltipText += ",RST:" + kitMap.parsedOptions.reset
      tooltipText += ",SVLD:" + kitMap.parsedOptions.saveload
      let status = `<span class="mx-2 d-flex align-items-center status-kit">`
        + `<span class="badge rounded-pill bg-primary" role="button" data-bs-toggle="tooltip" data-bs-placement="top" title="${tooltipText}">ID: ${kitMap.map.kid}</span>`
        + `<span class="text-secondary ms-2 text-truncate"><small>${kitMap.map.name}</small></span>`
        + `</span>`;
      KitBuild.getTextOfKit(kitMap.map.kid).then((text) => {
        this.text = text;
        let textLabel = text ? `Text: ${text.title}` : "Text: None";
        let statusText = `<span class="mx-2 d-flex align-items-center status-text">`;
        statusText += `<span class="badge rounded-pill bg-danger">${textLabel}</span>`;
        statusText += `</span>`;
        StatusBar.instance().remove(".status-text").append(statusText);
      });
      StatusBar.instance().remove('.status-kit').append(status);
    } else {
      this.setConceptMap();
      this.text = null;
      StatusBar.instance().remove('.status-kit');
      this.session.unset('kid');
    }
    $('[data-bs-toggle="tooltip"]').tooltip({ html: true })
  }

  setLearnerMap(learnerMap) { console.warn("LEARNER MAP SET:", learnerMap) 
    this.learnerMap = learnerMap
    if (learnerMap) {
      this.session.set('lmid', learnerMap.map.lmid)
      let status = `<span class="mx-2 d-flex align-items-center status-learnermap">`
        + `<span class="badge rounded-pill bg-warning text-dark">ID: ${learnerMap.map.lmid}</span>`
        + `</span>`
      StatusBar.instance().remove('.status-learnermap').append(status);
    } else {
      StatusBar.instance().remove('.status-learnermap');
      this.session.unset('lmid')
    }
  }

  handleEvent() {
  
    let saveAsDialog = UI.modal('#kit-save-as-dialog', {
      onShow: () => { 
        if (saveAsDialog.kitMap) { // means save existing kit...
          $('#kit-save-as-dialog .input-title').val(saveAsDialog.kitMap.map.name)
          $('#kit-save-as-dialog .input-title').focus().select()
          $('#input-fid').val(saveAsDialog.kitMap.map.kfid)
          $('#input-title').val(saveAsDialog.kitMap.map.name)
          $(`#input-layout-${saveAsDialog.kitMap.map.layout}`).prop('checked', true)
          $('#input-enabled').prop('checked', saveAsDialog.kitMap.map.enabled == "1" ? true : false)
        } else {
          $('#kit-save-as-dialog .input-title').val('Kit of ' + MixedApp.inst.conceptMap.map.title)
          $('#kit-save-as-dialog .input-title').focus().select()
          $('#kit-save-as-dialog .bt-generate-fid').trigger('click')
          $('#input-layout-preset').prop('checked', true)
          $('#input-enabled').prop('checked', true)
        }
      },
      hideElement: '.bt-cancel'
    })
    saveAsDialog.setKitMap = (kitMap) => { // console.log(kitMap)
      if (kitMap) saveAsDialog.kitMap = kitMap
      else saveAsDialog.kitMap = null
      return saveAsDialog;
    }
    saveAsDialog.setTitle = (title) => {
      $('#kit-save-as-dialog .dialog-title').html(title)
      return saveAsDialog
    }
    saveAsDialog.setIcon = (icon) => {
      $('#kit-save-as-dialog .dialog-icon').removeClass()
        .addClass(`dialog-icon bi bi-${icon} me-2`)
      return saveAsDialog
    }
  
    let openDialog = UI.modal('#concept-map-open-dialog', {
      hideElement: '.bt-cancel',
      width: '700px',
    })
  
    let contentDialog = UI.modal('#kit-content-dialog', {
      hideElement: '.bt-close',
      backdrop: false,
      get height() { return $('body').height() * .7 | 0 },
      get offset() { return { left: ($('body').width() * .1 | 0) } },
      draggable: true,
      dragHandle: '.drag-handle',
      resizable: true,
      resizeHandle: '.resize-handle',
      minWidth: 375,
      minHeight: 200,
      onShow: () => {
        let sdown = new showdown.Converter({
          strikethrough: true,
          tables: true,
          simplifiedAutoLink: true,
        });
        sdown.setFlavor("github");
        // console.log(contentDialog.text, contentDialog);
        let htmlText = contentDialog.text
          ? sdown.makeHtml(contentDialog.text.content)
          : "<em>Content text unavailable.</em>";
        $("#kit-content-dialog .content").html(htmlText);
        hljs.highlightAll();
      }
    })
    contentDialog.setContent = (content, type = 'md') => {
      contentDialog.text = content;
      return contentDialog;
    }
  
    let feedbackDialog = UI.modal('#feedback-dialog', {
      hideElement: '.bt-close',
      backdrop: false,
      draggable: true,
      dragHandle: '.drag-handle',
      width: 375,
      onShow: () => {
        $('#feedback-dialog').off('click').on('click', '.bt-modify', (e) => {
          $('.app-navbar .bt-clear-feedback').trigger('click')
          feedbackDialog.hide()
        })
      }
    })
    feedbackDialog.setCompare = (compare, level = Analyzer.MATCH | Analyzer.EXCESS) => {
      feedbackDialog.compare = compare;
      // console.log(compare, level);
      let content = ''
      if (compare.match.length && (level & Analyzer.MATCH)) {
        content += `<div class="d-flex align-items-center"><i class="bi bi-check-circle-fill text-success fs-1 mx-3"></i> `
        content += `<span>You have <strong class="text-success fs-bold">${compare.match.length} matching</strong> propositions.</span></div>`
      }
      if (compare.excess.length && (level & Analyzer.EXCESS)) {
        content += `<div class="d-flex align-items-center"><i class="bi bi-exclamation-triangle-fill text-primary fs-1 mx-3"></i> `
        content += `<span>You have <strong class="text-primary fs-bold">${compare.excess.length} excessive</strong> propositions.</span></div>`
      }
      if (compare.miss.length && level != Analyzer.NONE) {
        content += `<div class="d-flex align-items-center"><i class="bi bi-exclamation-triangle-fill text-danger fs-1 mx-3"></i> `
        content += `<span>You have <strong class="text-danger fs-bold">${compare.miss.length} missing</strong> propositions.</span></div>`
      }
  
      if (compare.excess.length == 0 && compare.miss.length == 0) {
        content = `<div class="d-flex align-items-center"><i class="bi bi-check-circle-fill text-success fs-1 mx-3"></i> `
        content += `<span><span class="text-success">Great!</span><br>All the propositions are <strong class="text-success fs-bold">matching</strong>.</span></div>`
      }
  
      $('#feedback-dialog .feedback-content').html(content)
      return feedbackDialog
    }

    let cgpassDialog = UI.modal('#cgpass-dialog', {
      hideElement: '.bt-close',
    });
  
  
  
  
  
  
  
  
  
    /** 
     * Open Kit
     * */
  
    $('.app-navbar').on('click', '.bt-open-kit', () => {
      if (feedbackDialog.learnerMapEdgesData) 
        $('.app-navbar .bt-clear-feedback').trigger('click')
      let tid = openDialog.tid;
      if (!tid) $('#concept-map-open-dialog .list-topic .list-item.default').trigger('click');
      else $(`#concept-map-open-dialog .list-topic .list-item[data-tid="${tid}"]`).trigger('click');
      $('#concept-map-open-dialog .bt-refresh-topic-list').trigger('click');
      openDialog.show()
    })
  
    $('#concept-map-open-dialog .list-topic').on('click', '.list-item', (e) => {
      if (openDialog.tid != $(e.currentTarget).attr('data-tid')) // different concept map?
        openDialog.cmid = null; // reset selected concept map id.
      openDialog.tid = $(e.currentTarget).attr('data-tid');
      $('#concept-map-open-dialog .list-topic .bi-check-lg').addClass('d-none');
      $('#concept-map-open-dialog .list-topic .list-item').removeClass('active');
      $(e.currentTarget).find('.bi-check-lg').removeClass('d-none');
      $(e.currentTarget).addClass('active');
  
      this.ajax.get(`kitBuildApi/getConceptMapListByTopic/${openDialog.tid}`).then(cmaps => { 
        // console.log(cmaps)
        let cmapsHtml = '';
        cmaps.forEach(cm => {
          cmapsHtml += `<span class="concept-map list-item" data-cmid="${cm.cmid}" data-cmfid="${cm.cmfid}">`
            + `<span class="text-truncate">${cm.title}</span>`
            + `<bi class="bi bi-check-lg text-primary d-none"></bi></span>`
        })
        $('#concept-map-open-dialog .list-concept-map').slideUp({
          duration: 100,
          complete: () => {
            $('#concept-map-open-dialog .list-concept-map')
              .html(cmapsHtml).slideDown({
                duration: 100,
                complete: () => {
                  if(openDialog.cmid) {
                    $(`#concept-map-open-dialog .list-concept-map .list-item[data-cmid="${openDialog.cmid}"]`)
                      .trigger('click')[0]
                      .scrollIntoView({
                        behavior: "smooth",
                        block: "center"
                      });
                  } else $('#concept-map-open-dialog .list-concept-map').scrollTop(0)
                }
              })
          }
        })
      })
    })
  
    $('#concept-map-open-dialog .list-concept-map').on('click', '.list-item', (e) => {
      if (openDialog.cmid != $(e.currentTarget).attr('data-cmid')) // different concept map?
        openDialog.kid = null; // reset selected kit id.
      openDialog.cmid = $(e.currentTarget).attr('data-cmid');
      $('#concept-map-open-dialog .list-concept-map .bi-check-lg').addClass('d-none');
      $('#concept-map-open-dialog .list-concept-map .list-item').removeClass('active');
      $(e.currentTarget).find('.bi-check-lg').removeClass('d-none');
      $(e.currentTarget).addClass('active');
  
      this.ajax.get(`kitBuildApi/getKitListByConceptMap/${openDialog.cmid}`).then(kits => { // console.log(kits)
        let kitsHtml = '';
        kits.forEach(k => {
          kitsHtml += `<span class="kit list-item" data-kid="${k.kid}" data-kfid="${k.kfid}">`
            + `<span class="text-truncate">${k.name}</span>`
            + `<bi class="bi bi-check-lg text-primary d-none"></bi></span>`
        })
        $('#concept-map-open-dialog .list-kit').slideUp({
          duration: 100,
          complete: () => {
            $('#concept-map-open-dialog .list-kit')
              .html(kitsHtml).slideDown({
                duration: 100,
                complete: () => {
                  let item = $(`#concept-map-open-dialog .list-kit .list-item[data-kid="${openDialog.kid}"]`)
                  if(openDialog.kid && item.length) {
                    item.trigger('click')[0]
                      .scrollIntoView({
                        behavior: "smooth",
                        block: "center"
                      });
                  } else $('#concept-map-open-dialog .list-kit').scrollTop(0)
                }
              })
          }
        })
      })
    })
  
    $('#concept-map-open-dialog .list-kit').on('click', '.list-item', (e) => {
      openDialog.kid = $(e.currentTarget).attr('data-kid');
      $('#concept-map-open-dialog .list-kit .bi-check-lg').addClass('d-none');
      $('#concept-map-open-dialog .list-kit .list-item').removeClass('active');
      $(e.currentTarget).find('.bi-check-lg').removeClass('d-none');
      $(e.currentTarget).addClass('active');
    })
    
    $('#concept-map-open-dialog .bt-refresh-topic-list').on('click', () => {
      console.log(MixedApp.inst.user, this);
      if (!MixedApp.inst || !MixedApp.inst.user || !MixedApp.inst.user.groups) return;
      this.ajax.post(`kitBuildApi/getTopicListOfGroups`, {
        gids: MixedApp.inst.user.groups.split(",")
      }).then(topics => { // console.log(topics)
        let topicsHtml = '';
        topics.forEach(t => { // console.log(t);
          topicsHtml += `<span class="topic list-item" data-tid="${t.tid}">`
           + `<span>${t.title}</span>`
           + `<bi class="bi bi-check-lg text-primary d-none"></bi></span>`
        });
        $('#concept-map-open-dialog .list-topic').slideUp({
          duration: 100,
          complete: () => {
            $('#concept-map-open-dialog .list-topic .list-item').not('.default').remove()
            $('#concept-map-open-dialog .list-topic').append(topicsHtml).slideDown(100)
            $(`#concept-map-open-dialog .list-topic .list-item[data-tid="${openDialog.tid}"]`).trigger('click')
          }
        })
      })
    })
  
    $('#concept-map-open-dialog').on('click', '.bt-open', (e) => {
      e.preventDefault()
      if (!openDialog.kid) {
        UI.dialog('Please select a concept map and a kit.').show();
        return
      }
      KitBuild.openKitMap(openDialog.kid).then(kitMap => {
        try {
          MixedApp.parseKitMapOptions(kitMap)
          let proceed = () => {
            MixedApp.inst.setKitMap(kitMap)
            MixedApp.inst.setLearnerMap()
            MixedApp.enableNavbarButton()
            MixedApp.resetMapToKit(kitMap, this.canvas).then(() => {
              let cyData = this.canvas.cy.elements().jsons();
              MixedApp.collab("command", "set-kit-map", kitMap, cyData)
            })
            openDialog.hide()
          }
          if (this.canvas.cy.elements().length) {
            let confirm = UI.confirm("Open the kit replacing the current kit on Canvas?").positive(() => {
              confirm.hide()
              proceed()
            }).show()
            return
          }
          proceed()
  
          // TODO: update logger state
  
        } catch (error) { console.error(error)
          UI.error("Unable to open selected kit.").show(); 
        }
      }).catch((error) => { console.error(error)
        UI.error("Unable to open selected kit.").show(); 
      })
    });
  
  
  
  
  
  
  
  
  
  
  
    /** 
     * Content
     * */
  
    $('.app-navbar').on('click', '.bt-content', () => {
      if (!this.kitMap) return;
      else contentDialog.setContent(this.text).show();
    })
  
    $('#kit-content-dialog .bt-scroll-top').on('click', (e) => {
      $('#kit-content-dialog .content').parent().animate({scrollTop: 0}, 200)
    })
  
    $('#kit-content-dialog .bt-scroll-more').on('click', (e) => {
      let height = $('#kit-content-dialog .content').parent().height()
      let scrollTop = $('#kit-content-dialog .content').parent().scrollTop()
      $('#kit-content-dialog .content').parent().animate({scrollTop: scrollTop + height - 16}, 200)
    })
  
  
  
  
  
  
  
  
  
  
  
  
    /** 
     * Save Load Learner Map
     * */
  
    $('.app-navbar').on('click', '.bt-save', () => { // console.log(MixedApp.inst)
      let learnerMap = MixedApp.inst.learnerMap
      let kitMap = MixedApp.inst.kitMap
      if (!kitMap) {
        UI.warning('Please open a kit.').show()
        return
      }
      if (feedbackDialog.learnerMapEdgesData) 
        $('.app-navbar .bt-clear-feedback').trigger('click')      
      let elements = KitBuildUI.buildConceptMapData(this.canvas, kitMap.conceptMap);
      let data = Object.assign({
        lmid: learnerMap && learnerMap.map ? learnerMap.map.lmid : null,
        kid: kitMap.map.kid,
        author: MixedApp.inst.user ? MixedApp.inst.user.username : null,
        type: 'draft',
        cmid: kitMap.map.cmid,
        create_time: null,
        data: null,
      }, elements); console.log(data); // return
      this.ajax.post("kitBuildApi/saveLearnerMapExtended", { data: Core.compress(data) })
        .then(learnerMap => { // console.log(learnerMap);
          MixedApp.inst.setLearnerMap(learnerMap);
          UI.success("Concept map has been saved successfully.").show(); 
        })
        .catch(error => { UI.error(error).show(); })
    })
  
    $('.app-navbar').on('click', '.bt-load', () => {
      let kitMap = MixedApp.inst.kitMap
      if (!kitMap) {
        UI.warning('Please open a kit.').show()
        return
      }
      if (feedbackDialog.learnerMapEdgesData) 
        $('.app-navbar .bt-clear-feedback').trigger('click')
      
      let data = {
        kid: kitMap.map.kid,
        username: MixedApp.inst.user.username
      }
      if (!data.username) delete data.username
      console.log(data);
      this.ajax.post('kitBuildApi/getLastDraftExtendedLearnerMapOfUser', data).then(learnerMap => { console.log(learnerMap)
        if (!learnerMap) {
          UI.warning("No user saved map data for this kit.").show()
          return
        }
        if (this.canvas.cy.elements().length) {
          let confirm = UI.confirm("Load saved concept map?")
            .positive(() => {
              learnerMap.kitMap = kitMap;
              learnerMap.conceptMap = kitMap.conceptMap;
              this.canvas.cy.elements().remove()
              console.log(learnerMap);
              let cyData = KitBuildUI.composeLearnerMap(learnerMap);
              cyData.forEach(el => { // console.error(el.data);
                if (["nodes"].includes(el.group) && el.data?.extension !== true) el.data.lock = "locked";
              }); // console.log(cyData);
              this.canvas.cy.add(cyData)
              this.canvas.applyElementStyle()
              this.canvas.toolbar.tools.get(KitBuildToolbar.CAMERA).fit(null, {duration: 0}).then(() => {
                MixedApp.collab("command", "set-kit-map", kitMap, 
                  this.canvas.cy.elements().jsons())
              })
              MixedApp.inst.setLearnerMap(learnerMap);
              
              UI.info("Concept map loaded.").show()
              confirm.hide()
            }).show()
            return
        }
        MixedApp.openLearnerMap(learnerMap.map.lmid, this.canvas);
      }).catch(error => {
        console.error(error)
        UI.error("Unable to load saved concept map.").show()
      })
    })
    
  
  
  
  
    
  
  
    /**
     * Reset concept map to kit 
     * */
  
    $('.app-navbar').on('click', '.bt-reset', e => {
      if (!MixedApp.inst.kitMap) {
        UI.info('Please open a kit.')
        return
      }
      if (feedbackDialog.learnerMapEdgesData) 
        $('.app-navbar .bt-clear-feedback').trigger('click')
  
      let confirm = UI.confirm('Do you want to reset this concept map as defined in the kit?').positive(() => {
        KitBuild.openKitMap(MixedApp.inst.kitMap.map.kid)
          .then(kitMap => {
            MixedApp.parseKitMapOptions(kitMap)
            MixedApp.resetMapToKit(kitMap, this.canvas).then(() => {
              MixedApp.collab("command", "set-kit-map", kitMap, 
                this.canvas.cy.elements().jsons())
            })
            let undoRedo = this.canvas.toolbar.tools.get(KitBuildToolbar.UNDO_REDO)
            if (undoRedo) undoRedo.clearStacks().updateStacksStateButton()
            confirm.hide()
            UI.info('Concept map has been reset.').show()
            return
        })
      }).show()
    })
  
  
  
  
  
  
  
  
  
  
  
    /**
     * 
     * Feedback
     */
    $('.app-navbar').on('click', '.bt-feedback', () => {
  
      if (!MixedApp.inst.kitMap) return
      if (feedbackDialog.learnerMapEdgesData) 
        $('.app-navbar .bt-clear-feedback').trigger('click')
  
      let kitMap = MixedApp.inst.kitMap
      
      feedbackDialog.learnerMapEdgesData = this.canvas.cy.edges().jsons()
  
      let elements = KitBuildUI.buildConceptMapData(this.canvas, kitMap.conceptMap);
      let feedbacksave = MixedApp.inst.kitMap.parsedOptions.feedbacksave
      if (feedbacksave) {
        let data = Object.assign({
          lmid: null, // so it will insert new rather than update
          kid: kitMap.map.kid,
          author: MixedApp.inst.user ? MixedApp.inst.user.username : null,
          type: 'feedback',
          cmid: kitMap.map.cmid,
          create_time: null,
          data: null,
        }, elements); // console.log(data); // return
        this.ajax.post("kitBuildApi/saveLearnerMapExtended", { data: Core.compress(data) })
          .then(learnerMap => { console.error(learnerMap);
            console.warn("Concept map save-on-feedback has been saved successfully.");
          }).catch(error => { console.error(error); })
      }
  
      elements.conceptMap = MixedApp.inst.conceptMap
      Analyzer.composePropositions(elements)
      let direction = elements.conceptMap.map.direction
      let feedbacklevel = MixedApp.inst.kitMap.parsedOptions.feedbacklevel
      let compare = Analyzer.compare(elements, direction)
      let level = Analyzer.NONE
      let dialogLevel = Analyzer.NONE;
      switch(feedbacklevel) {
        case 0: 
        case 1: level = Analyzer.NONE; break;
        case 2: level = Analyzer.MATCH | Analyzer.EXCESS; break;
        case 3: level = Analyzer.MATCH | Analyzer.EXCESS | Analyzer.EXPECT; break;
        case 4: level = Analyzer.MATCH | Analyzer.EXCESS | Analyzer.MISS; break
      }
      switch(feedbacklevel) {
        case 0: dialogLevel = Analyzer.NONE; break;
        case 1:
        case 2:
        case 3:
        case 4: dialogLevel = Analyzer.MATCH | Analyzer.EXCESS; break;
      }
  
      Analyzer.showCompareMap(compare, this.canvas.cy, direction, level)
      this.canvas.canvasTool.enableIndicator(false).enableConnector(false)
        .clearCanvas().clearIndicatorCanvas()
      // console.log(compare, level);
      feedbackDialog.setCompare(compare, dialogLevel).show()
  
      
    })
    $('.app-navbar').on('click', '.bt-clear-feedback', () => {
      if (!feedbackDialog.learnerMapEdgesData) return
      this.canvas.cy.edges().remove()
      this.canvas.cy.add(feedbackDialog.learnerMapEdgesData)
      this.canvas.applyElementStyle()
      this.canvas.canvasTool.enableIndicator().enableConnector()
        .clearCanvas().clearIndicatorCanvas()
      feedbackDialog.learnerMapEdgesData = null
    })
  
  
  
  
  
  
  
  
  
  
  
  
  
    /** 
     * 
     * Submit
    */
    $('.app-navbar').on('click', '.bt-submit', () => {
      if (feedbackDialog.learnerMapEdgesData) 
        $('.app-navbar .bt-clear-feedback').trigger('click')
      
      let kitMap = MixedApp.inst.kitMap;
      let learnerMapData = KitBuildUI.buildConceptMapData(this.canvas, kitMap.conceptMap);
      let confirm = UI.confirm("Do you want to submit your concept map?<br/>This will end your concept map recomposition session.")
        .positive(() => {
          let data = Object.assign({
            lmid: null, // so it will insert new rather than update
            kid: kitMap.map.kid,
            author: MixedApp.inst.user ? MixedApp.inst.user.username : null,
            type: 'fix',
            cmid: kitMap.map.cmid,
            create_time: null,
            data: null,
          }, learnerMapData); // console.log(data); // return
          confirm.hide()
          this.ajax.post("kitBuildApi/saveLearnerMapExtended", { data: Core.compress(data) })
            .then(learnerMap => {
              
              // TODO: check if kit allow review to show full comparison?
              // TODO: set session of submitted learner map for review
              Core.instance().session().set('flmid', learnerMap.map.lmid).then((result) => {
                UI.success("Concept map has been submitted. Now redirecting to review page...").show();
                setTimeout(() => {
                  // TODO: and then change state to full feedback if set in kit options
                  let baseurl = Core.instance().config().get('baseurl')
                  window.location.href = baseurl + "review";
                }, 2000)
              }).catch(() => {
                UI.error('Unable to proceed to review.').show()
              });
  
                
            }).catch(error => { console.error(error); })
  
        }).show()
    })
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
    /** 
     * 
     * Change password
    */
    $('.app-navbar .cgpass').on('click', (e) => {
      e.preventDefault();
      this.session.get('user').then((user) => {
        // console.log(user);
        $('#cgpass-dialog .user-username').html(user.username);
        $('#cgpass-dialog .user-name').html(user.name);
        $('#form-cgpass input[name="username"]').val(user.username);
        cgpassDialog.show();
      }, (error) => { 
        console.error(error);
        UI.errorDialog(error); 
      });
    });
    $('#form-cgpass').on('submit', (e) => {
      e.preventDefault();

      let username = $('#form-cgpass input[name="username"]').val();
      // console.log(username);
  
      let p0 = $('#password0').val();
      let p1 = $('#password1').val();
      let p2 = $('#password2').val();
  
      let valid = true;
  
      if (p0 === '') {
        $('.password0.invalid-feedback').text('Please provide your current password.');
        $('#password0').addClass('is-invalid');
        valid = false;
      } else $('#password0').removeClass('is-invalid').addClass('is-valid');
  
      if (p1 === '') {
        $('.password1.invalid-feedback').text('New password cannot be empty.');
        $('#password1').addClass('is-invalid');
        valid = false;
      } else $('#password1').removeClass('is-invalid').addClass('is-valid');
  
      if (p2 === '') {
        $('.password2.invalid-feedback').text('New password (repeat) cannot be empty.');
        $('#password2').addClass('is-invalid');
        valid = false;
      } else $('#password2').removeClass('is-invalid').addClass('is-valid');
  
      if (!valid) return;
  
      if (p1 != p2) {
        $('.password1.invalid-feedback').text('New password and new password (repeat) must be equal');
        $('#password1').addClass('is-invalid');
        $('#password2').addClass('is-invalid');
        return;
      } else if (!(p1.match(/[a-z]+/gi) && p1.match(/[0-9]+/gi) && p1.length >= 8)) {
        $('.password1.invalid-feedback').text('Password must contains alphanumeric characters (a-z, 0-9) with at least consisted of 8 or more characters.');
        $('#password1').addClass('is-invalid');
        return;
      } else {
        $('#password1').removeClass('is-invalid');
        $('#password2').removeClass('is-invalid');
      }
  
      $('#password1').addClass('is-valid');
      $('#password2').addClass('is-valid');
  
      this.ajax.post('RBACApi/changeUserPassword',
        {
          username: username,
          currentPassword: p0, // current password
          password: p1,        // new password
          passwordRepeat: p2   // new password repeat
        }
      ).then((result) => {
        // console.log(result);
        if (result) {
          cgpassDialog.hide();
          UI.successDialog('<span class="text-success">Password has been successfully changed.</span> <br> Next time you log in you will need to use the new password.').show();
        } else UI.errorDialog('Password change error. Incorrect old password or new password is equal to old password.').show();
      }, (error) => {
        // console.error(error);
        UI.errorDialog('Password change error. Incorrect old password or new password is equal to old password.').show();
      });
  
  
  
      // let valid = e.currentTarget.checkValidity();
      // console.log(valid);
      // $(e.currentTarget).addClass('was-validated');
  
  
  
    });
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
    /** 
     * 
     * Logout
    */
    $('.app-navbar .bt-logout').on('click', (e) => {
      let confirm = UI.confirm('Do you want to logout?<br>This will <strong class="text-danger">END</strong> your concept mapping session.').positive(() => {
        Core.instance().session().unset('user').then(() => {
          MixedApp.inst.setKitMap(null);
          MixedApp.inst.setLearnerMap(null);
          KitBuildCollab.enableControl(false);
          MixedApp.enableNavbarButton(false);
          MixedApp.updateSignInOutButton();
          StatusBar.instance().remove('.status-user');
          if (MixedApp.collabInst) MixedApp.collabInst.disconnect();
          this.canvas.cy.elements().remove();
          this.canvas.canvasTool.clearCanvas().clearIndicatorCanvas();
          this.canvas.toolbar.tools.get(KitBuildToolbar.UNDO_REDO).clearStacks().updateStacksStateButton();
          UI.success("You have signed out.").show();
  
          confirm.hide()
        });
        // TODO: redirect to home/login page
      }).show()
    })
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
    /** 
     * 
     * Sign In
    */
    $(".app-navbar .bt-sign-in").on("click", (e) => {
      this.runtime.load("config.ini").then((runtimes) => {
        let runtimeGids = runtimes["sign-in-group"];
        // console.log(runtimes, runtimeGids);
        this.signInDialog(runtimeGids);
      }, (err) => this.signInDialog());
    });
  
  }
  
  signInDialog(runtimeGids) {
    this.modalSignIn = SignIn.instance({
      gids: runtimeGids ?? null,
      success: (user) => {
        L.log("sign-in-success", user);
        this.session.set("user", user);
        this.modalSignIn.hide();
        this.setUser(user);
        this.initCollab(user);
        MixedApp.updateSignInOutButton();
        MixedApp.enableNavbarButton();
        KitBuildCollab.enableControl();
        let status = `<span class="mx-2 d-flex align-items-center status-user">` +
          `<small class="text-dark fw-bold">${user.name}</small>` +
          `</span>`;
        StatusBar.instance().remove(".status-user").prepend(status);
        this.logger.username = user.username;
      },
    }).show();
  }

  /**
   * 
   * Handle refresh web browser
   */
  
  handleRefresh() {
    let stateData = JSON.parse(localStorage.getItem(MixedApp.name))
    // console.warn("RESTORE STATE:", stateData)
    this.session.getAll().then(sessions => { // console.log(sessions)
      let kid  = sessions.kid
      let lmid = sessions.lmid
      let promises = []
      if (kid) promises.push(KitBuild.openKitMap(kid))
      if (lmid) promises.push(KitBuild.openExtendedLearnerMap(lmid))
      Promise.all(promises).then(maps => {
        let kitMap = maps[0]
        let learnerMap = maps[1]
        MixedApp.parseKitMapOptions(kitMap)
        if (kitMap && !learnerMap) MixedApp.resetMapToKit(kitMap, this.canvas)
        if (kitMap) {
          try {
            if (stateData && stateData.logger) {
              // reinstantiate and enable logger
              MixedApp.inst.logger = 
              KitBuildLogger.instance(stateData.logger.username, stateData.logger.seq, stateData.logger.sessid, this.canvas, kitMap.conceptMap).enable();
              // reattach logger
              if (MixedApp.loggerListener)
                this.canvas.off("event", MixedApp.loggerListener)
              MixedApp.loggerListener = MixedApp.inst.logger.onCanvasEvent.bind(MixedApp.inst.logger)
              this.canvas.on("event", MixedApp.loggerListener)
            }
          } catch (error) { console.warn(error) }
          MixedApp.inst.setKitMap(kitMap);
        }
        if (kitMap && learnerMap) {
          MixedApp.inst.setKitMap(kitMap)
          MixedApp.inst.setLearnerMap(learnerMap)
          learnerMap.kitMap = kitMap
          learnerMap.conceptMap = kitMap.conceptMap
          this.canvas.cy.elements().remove()
          let cyData = KitBuildUI.composeLearnerMap(learnerMap);
          cyData.forEach(el => { // console.error(el.data);
            if (["nodes"].includes(el.group) && el.data?.extension !== true) el.data.lock = "locked";
          })
          this.canvas.cy.add(cyData)
          this.canvas.toolbar.tools.get(KitBuildToolbar.CAMERA).fit(null, {duration: 0})
          this.canvas.applyElementStyle()
        } // else UI.warning('Unable to display kit.').show()
        MixedApp.enableNavbarButton();
      })
  
      MixedApp.enableNavbarButton(false)
      if (sessions.user) {
        this.setUser(sessions.user);
        this.initCollab(sessions.user);
        MixedApp.enableNavbarButton();
        KitBuildCollab.enableControl();
  
        let status = `<span class="mx-2 d-flex align-items-center status-user">`
        + `<small class="text-dark fw-bold">${sessions.user.name}</small>`
        + `</span>`
        StatusBar.instance().remove('.status-user').prepend(status);
      } else $('.app-navbar .bt-sign-in').trigger('click')
  
      // listen to events for broadcast to collaboration room as commands
      this.canvas.on('event', MixedApp.onCanvasEvent)
  
    })
  }

  initCollab(user) {
    MixedApp.collabInst = KitBuildCollab.instance('kitbuild', user, this.canvas, {
      host: this.config.get('collabhost'),
      port: this.config.get('collabport'),
    });
    MixedApp.collabInst.off('event', MixedApp.onCollabEvent);
    MixedApp.collabInst.on('event', MixedApp.onCollabEvent);
    KitBuildCollab.enableControl()
  }
}

MixedApp.canvasId = "recompose-canvas"


MixedApp.onBrowserStateChange = event => { console.warn(event)
  if (event.newState == "terminated") {
    let stateData = {}
    console.log(MixedApp.inst.logger)
    if (MixedApp.inst && MixedApp.inst.logger) 
      stateData.logger = {
        username: MixedApp.inst.logger.username,
        seq: MixedApp.inst.logger.seq,
        sessid: MixedApp.inst.logger.sessid,
        enabled: MixedApp.inst.logger.enabled,
      }
    stateData.map = Core.compress(MixedApp.inst.canvas.cy.elements().jsons())
    // console.warn(JSON.stringify(MixedApp.inst.canvas.cy.elements().jsons()), 
      // JSON.stringify(MixedApp.inst.canvas.cy.nodes().jsons()))
    let cmapAppStateData = JSON.stringify(Object.assign({}, stateData)) 
    console.warn("STATE STORE:", cmapAppStateData)
    localStorage.setItem(MixedApp.name, cmapAppStateData)
  }
}


/** 
 * 
 * Collaborations
*/


// convert concept mapping event to collaboration command
// App --> Server
MixedApp.collab = (action, ...data) => {
  // not connected? skip.
  if (!MixedApp.collabInst || !MixedApp.collabInst.connected()) return
  if (!KitBuildCollab.room()) return
  
  switch(action) {
    case "command": {
      let command = data.shift()
      // console.warn(command, data);
      MixedApp.collabInst.command(command, ...data).then(result => {
        console.error(command, result);
      }).catch(error => console.error(command, error))
    } break;
    case "get-map-state": {
      MixedApp.collabInst.getMapState().then(result => {})
        .catch(error => UI.error("Unable to get map state: " + error).show())
    } break;
    case "send-map-state": {
      MixedApp.collabInst.sendMapState(...data).then(result => {})
        .catch(error => UI.error("Unable to send map state: " + error).show())
    } break;
    case "get-channels": { 
      MixedApp.collabInst.tools.get('channel').getChannels()
        .then(channels => {})
        .catch(error => UI.error("Unable to get channels: " + error)
        .show())
    } break;
  }
}

MixedApp.onCanvasEvent = (canvasId, event, data) => {
  MixedApp.collab("command", event, canvasId, data);
}

// handles incoming collaboration event
// Server --> App
MixedApp.onCollabEvent = (event, ...data) => {
  // console.warn(event, data)
  switch(event) {
    case 'connect':
    case 'reconnect':
      break;
    case 'join-room': {
      MixedApp.collab("get-map-state")
    } break;
    case 'socket-command': {
      let command = data.shift()
      MixedApp.processCollabCommand(command, data)
    } break;
    case 'socket-get-map-state': {
      let requesterSocketId = data.shift()
      MixedApp.generateMapState()
        .then(mapState => {
          MixedApp.collab("send-map-state", requesterSocketId, mapState)
        })
    }  break;
    case 'socket-set-map-state': {
      let mapState = data.shift()
      MixedApp.applyMapState(mapState).then(() => {
        MixedApp.collab("get-channels")
      });
    }  break;
  }
}
MixedApp.processCollabCommand = (command, data) => {
  console.log(command, data)
  switch(command) {
    case "set-kit-map": {
      let kitMap = data.shift()
      let cyData = data.shift()
      console.log(kitMap, cyData, MixedApp.inst.learnerMap)
      MixedApp.inst.setKitMap(kitMap)
      MixedApp.enableNavbarButton()
      // if current user has no saved learnerMap
      // or it is different kit, then reset the learnermap
      if (MixedApp.inst.learnerMap
        && MixedApp.inst.learnerMap.map.kid == kitMap.map.kid) {} 
      else MixedApp.inst.setLearnerMap() // remove save data
      
      // MixedApp.inst.setLearnerMap()
      MixedApp.resetMapToKit(kitMap, MixedApp.inst.canvas)
        .then(() => {
          console.log(cyData)
          MixedApp.inst.canvas.cy.elements().remove()
          MixedApp.inst.canvas.cy.add(cyData)
          MixedApp.inst.canvas.applyElementStyle()
          MixedApp.inst.canvas.canvasTool.clearCanvas().clearIndicatorCanvas()
          MixedApp.inst.canvas.toolbar.tools.get(KitBuildToolbar.CAMERA).fit(null, {duration: 0})
          // MixedApp.inst.canvas.toolbar.tools.get(KitBuildToolbar.NODE_CREATE).setActiveDirection(kitMap.conceptMap.map.direction)
          MixedApp.inst.canvas.toolbar.tools.get(KitBuildToolbar.UNDO_REDO).clearStacks().updateStacksStateButton();
          UI.info('Concept map has been set by peer.').show()
        })
    } break;
    case "move-nodes": {
      let canvasId = data.shift()
      let moves = data.shift()
      let nodes = moves.later;
      if (Array.isArray(nodes)) nodes.forEach(node => 
      MixedApp.inst.canvas.moveNode(node.id, node.x, node.y, 200))
    } break;
    case "redo-move-nodes":
    case "undo-move-nodes": {
      let canvasId = data.shift()
      let moves = data.shift()
      let nodes = moves;
      if (Array.isArray(nodes)) nodes.forEach(node => 
      MixedApp.inst.canvas.moveNode(node.id, node.x, node.y, 200))
    } break;
    case "undo-centroid":
    case "undo-move-link":
    case "undo-move-concept": {
      let canvasId = data.shift()
      let move = data.shift()
      MixedApp.inst.canvas.moveNode(move.from.id, move.from.x, move.from.y, 200)
    } break;
    case "centroid":
    case "redo-centroid":
    case "redo-move-link":
    case "redo-move-concept":
    case "move-link":
    case "move-concept": {
      let canvasId = data.shift()
      let move = data.shift()
      MixedApp.inst.canvas.moveNode(move.to.id, move.to.x, move.to.y, 200)
    } break;
    case "layout-elements": {
      let canvasId = data.shift()
      let layoutMoves = data.shift()
      let nodes = layoutMoves.later;
      if (Array.isArray(nodes)) nodes.forEach(node => 
      MixedApp.inst.canvas.moveNode(node.id, node.position.x, node.position.y, 200))
    } break;
    case "redo-layout-elements":
    case "undo-layout-elements":
    case "undo-layout": {
      let canvasId = data.shift()
      let nodes = data.shift()
      if (Array.isArray(nodes)) nodes.forEach(node => 
      MixedApp.inst.canvas.moveNode(node.id, node.position.x, node.position.y, 200))
    } break;
    case "undo-disconnect-right":
    case "undo-disconnect-left":
    case "redo-connect-right":
    case "redo-connect-left":
    case "connect-right":
    case "connect-left": {
      let canvasId = data.shift()
      let edge = data.shift()
      MixedApp.inst.canvas.createEdge(edge.data)
    } break;
    case "undo-connect-right":
    case "undo-connect-left":
    case "redo-disconnect-right":
    case "redo-disconnect-left":
    case "disconnect-left":
    case "disconnect-right": { 
      let canvasId = data.shift()
      let edge = data.shift()
      MixedApp.inst.canvas.removeEdge(edge.data.source, edge.data.target)
    } break;
    case "undo-move-connect-left":
    case "undo-move-connect-right": { 
      let canvasId = data.shift()
      let moveData = data.shift()
      MixedApp.inst.canvas.moveEdge(moveData.later, moveData.prior)
    } break;
    case "redo-move-connect-left":
    case "redo-move-connect-right":
    case "move-connect-left":
    case "move-connect-right": { 
      let canvasId = data.shift()
      let moveData = data.shift()
      MixedApp.inst.canvas.moveEdge(moveData.prior, moveData.later)
    } break;
    case "switch-direction": { 
      let canvasId = data.shift()
      let switchData = data.shift()
      MixedApp.inst.canvas.switchDirection(switchData.prior, switchData.later)
    } break;
    case "undo-disconnect-links": { 
      let canvasId = data.shift()
      let edges = data.shift()
      if (!Array.isArray(edges)) break;
      edges.forEach(edge => {
        MixedApp.inst.canvas.createEdge(edge.data)
      })
    } break;
    case "redo-disconnect-links":
    case "disconnect-links": { 
      let canvasId = data.shift()
      let edges = data.shift()
      if (!Array.isArray(edges)) break;
      console.log(edges)
      edges.forEach(edge => {
        MixedApp.inst.canvas.removeEdge(edge.data.source, edge.data.target)
      })
    } break;
    case "create-link":
    case "create-concept":
    case "redo-duplicate-link":
    case "redo-duplicate-concept":
    case "duplicate-link":
    case "duplicate-concept": { 
      let canvasId = data.shift()
      let node = data.shift()
      console.log(node)
      MixedApp.inst.canvas.addNode(node.data, node.position)
    } break;
    case "undo-duplicate-link":
    case "undo-duplicate-concept": { 
      let canvasId = data.shift()
      let node = data.shift()
      console.log(node)
      MixedApp.inst.canvas.removeElements([node.data])
    } break;
    case "duplicate-nodes": { 
      let canvasId = data.shift()
      let nodes = data.shift()
      if (!Array.isArray(nodes)) break;
      nodes.forEach(node =>
        MixedApp.inst.canvas.addNode(node.data, node.position))
    } break;
    case "undo-delete-node":
    case "undo-clear-canvas":
    case "undo-delete-multi-nodes": { 
      let canvasId = data.shift()
      let elements = data.shift()
      MixedApp.inst.canvas.addElements(elements)
    } break;
    case "delete-link":
    case "delete-concept": 
    case "redo-delete-multi-nodes":
    case "delete-multi-nodes": {
      let canvasId = data.shift()
      let elements = data.shift()
      MixedApp.inst.canvas.removeElements(elements.map(element => element.data))
    } break;
    case "undo-update-link":
    case "undo-update-concept": {
      let canvasId = data.shift()
      let node = data.shift()
      MixedApp.inst.canvas.updateNodeData(node.id, node.prior.data)
    } break;
    case "redo-update-link":
    case "redo-update-concept":
    case "update-link":
    case "update-concept": {
      let canvasId = data.shift()
      let node = data.shift()
      MixedApp.inst.canvas.updateNodeData(node.id, node.later.data)
    } break;
    case "redo-concept-color-change":
    case "undo-concept-color-change": {
      let canvasId = data.shift()
      let changes = data.shift()
      MixedApp.inst.canvas.changeNodesColor(changes)
    } break;
    case "concept-color-change": {
      let canvasId = data.shift()
      let changes = data.shift()
      let nodesData = changes.later
      MixedApp.inst.canvas.changeNodesColor(nodesData)
    } break;
    case "undo-lock":
    case "undo-unlock":
    case "redo-lock":
    case "redo-unlock":
    case "lock-edge":
    case "unlock-edge": {
      let canvasId = data.shift()
      let edge = data.shift()
      MixedApp.inst.canvas.updateEdgeData(edge.id, edge)
    } break;
    case "undo-lock-edges":
    case "undo-unlock-edges":
    case "redo-lock-edges":
    case "redo-unlock-edges": {
      let canvasId = data.shift()
      let lock = data.shift()
      if (!lock) break;
      if (!Array.isArray(lock.edges)) break;
      lock.edges.forEach(edge =>
        MixedApp.inst.canvas.updateEdgeData(edge.substring(1), { lock: lock.lock }))
    } break;
    case "lock-edges":
    case "unlock-edges": {
      let canvasId = data.shift()
      let edges = data.shift()
      if (!Array.isArray(edges)) return;
      edges.forEach(edge =>
        MixedApp.inst.canvas.updateEdgeData(edge.data.id, edge.data))
    } break;
    case "redo-clear-canvas":
    case "clear-canvas": {
      MixedApp.inst.canvas.reset()
    } break;
    case "convert-type": {
      let canvasId = data.shift()
      let map = data.shift()
      let elements = map.later
      let direction = map.to
      MixedApp.inst.canvas.convertType(direction, elements)
    } break;
    case "select-nodes": {
      let canvasId = data.shift()
      let ids = data.shift()
      ids = ids.map(id => `#${id}`)
      MixedApp.inst.canvas.cy.nodes(ids.join(", ")).addClass('peer-select')
    } break;
    case "unselect-nodes": {
      let canvasId = data.shift()
      let ids = data.shift()
      ids = ids.map(id => `#${id}`)
      MixedApp.inst.canvas.cy.nodes(ids.join(", ")).removeClass('peer-select')
    } break;

  }
}

// generate/apply map state
MixedApp.generateMapState = () => {
  return new Promise((resolve, reject) => {
    let mapState = {
      kitMap: null,
      cyData: []
    }  
    if (MixedApp.inst.kitMap) {
      MixedApp.inst.kitMap.conceptMap.map.direction = MixedApp.inst.canvas.direction
      mapState = {
        kitMap: MixedApp.inst.kitMap,
        cyData: MixedApp.inst.canvas.cy.elements().jsons()
      }
    }
    resolve(mapState)
  })
}
MixedApp.applyMapState = (mapState) => {
  return new Promise((resolve, reject) => {
    let kitMap = mapState.kitMap
    let cyData = mapState.cyData
    MixedApp.inst.setKitMap(kitMap)
    MixedApp.inst.canvas.cy.elements().remove()
    MixedApp.enableNavbarButton()
    if (!kitMap || !cyData) {
      // console.log(mapState)
    } else {
      MixedApp.inst.canvas.cy.add(cyData ? cyData : {}).unselect()
      MixedApp.inst.canvas.applyElementStyle()
      MixedApp.inst.canvas.toolbar.tools.get(KitBuildToolbar.CAMERA).fit(null, {duration: 0})
      // MixedApp.inst.canvas.toolbar.tools.get(KitBuildToolbar.NODE_CREATE).setActiveDirection(conceptMap.map.direction)
      MixedApp.inst.canvas.toolbar.tools.get(KitBuildToolbar.UNDO_REDO).clearStacks().updateStacksStateButton()
    }
    MixedApp.inst.canvas.canvasTool.clearCanvas().clearIndicatorCanvas()
    resolve(mapState)
  })
}


/** 
 * 
 * Helpers
*/

MixedApp.parseKitMapOptions = (kitMap) => {
  if (!kitMap) return
  kitMap.parsedOptions = MixedApp.parseOptions(kitMap.map.options, {
    feedbacklevel: 2,
    fullfeedback: 1,
    modification: 1,
    readcontent: 1,
    saveload: 1,
    reset: 1,
    feedbacksave: 1,
    log: 0
  })
}

MixedApp.resetMapToKit = (kitMap, canvas) => {
  return new Promise((resolve, reject) => {
    // will also set and cache the concept map
    MixedApp.inst.setKitMap(kitMap)
    MixedApp.enableNavbarButton()
    canvas.cy.elements().remove()
    canvas.cy.add(KitBuildUI.composeKitMap(kitMap))
    canvas.cy.nodes().data('lock', 'locked');
    canvas.applyElementStyle()
    if (kitMap.map.layout == "random") {
      canvas.cy.elements().layout({name: 'fcose', animationDuration: 0, fit: false, stop: () => {
        canvas.toolbar.tools.get(KitBuildToolbar.CAMERA).center(null, {duration: 0})
        resolve(true)
      }}).run()
    } else {
      canvas.toolbar.tools.get(KitBuildToolbar.CAMERA).fit(null, {duration: 0})
      resolve(true)
    }
    
    // TODO: apply kit options to UI
    // console.log(kitMap)
  
    let feedbacklevelFeature = '<button class="bt-feedback btn btn-warning"><i class="bi bi-eye-fill"></i> Feedback</button>'
    feedbacklevelFeature += '<button class="bt-clear-feedback btn btn-warning"><i class="bi bi-eye-slash-fill"></i> Clear Feedback</button>'
    let saveloadFeature = '<button class="bt-save btn btn-secondary"><i class="bi bi-download"></i> Save</button>'
    saveloadFeature += '<button class="bt-load btn btn-secondary"><i class="bi bi-upload"></i> Load</button>'
    let readcontentFeature = '<button class="bt-content btn btn-sm btn-secondary"><i class="bi bi-file-text-fill"></i> Contents</button>'
    let resetFeature = '<button class="bt-reset btn btn-danger"><i class="bi bi-arrow-counterclockwise"></i> Reset</button>'
  
    if (kitMap.parsedOptions.feedbacklevel) $('#recompose-feedbacklevel').html(feedbacklevelFeature).removeClass('d-none')
    else $('#recompose-feedbacklevel').html('').addClass('d-none')
    if (kitMap.parsedOptions.saveload) $('#recompose-saveload').html(saveloadFeature).removeClass('d-none')
    else $('#recompose-saveload').html('').addClass('d-none')
    if (kitMap.parsedOptions.reset) $('#recompose-reset').html(resetFeature).removeClass('d-none')
    else $('#recompose-reset').html('').addClass('d-none')
    if (kitMap.parsedOptions.readcontent) $('#recompose-readcontent').html(readcontentFeature).removeClass('d-none')
    else $('#recompose-readcontent').html('').addClass('d-none')
    return
  })
}

MixedApp.parseOptions = (optionJsonString, defaultValueIfNull) => {
  if (optionJsonString === null) return defaultValueIfNull
  let option, defopt = defaultValueIfNull
  try {
    option = Object.assign({}, defopt, JSON.parse(optionJsonString))
    option.feedbacklevel = option.feedbacklevel ? parseInt(option.feedbacklevel) : defopt.feedbacklevel
  } catch (error) { UI.error(error).show() }
  return option
}

MixedApp.updateSignInOutButton = () => {
  Core.instance().session().getAll().then(sessions => { // console.log(sessions)
    if (sessions.user) {
      $('.bt-sign-in').addClass('d-none');
      $('.bt-logout').removeClass('d-none');
      $('.bt-profile').removeClass('d-none');
    } else {
      $('.bt-sign-in').removeClass('d-none');
      $('.bt-logout').addClass('d-none');
      $('.bt-profile').addClass('d-none')
    }
  });
}


MixedApp.enableNavbarButton = (enabled = true) => {
  $('#recompose-readcontent button').prop('disabled', !enabled);
  $('#recompose-saveload button').prop('disabled', !enabled);
  $('#recompose-reset button').prop('disabled', !enabled);
  $('#recompose-feedbacklevel button').prop('disabled', !enabled);
  $('.bt-submit').prop('disabled', !enabled);
  $('.bt-open-kit').prop('disabled', !enabled);
  MixedApp.inst.canvas.toolbar.tools.forEach((tool, key) => {
    if (key == KitBuildToolbar.NODE_CREATE) {
      if (MixedApp.inst.kitMap) tool.enable(enabled)
      else tool.enable(false)
    } else tool.enable(enabled);
  });
}