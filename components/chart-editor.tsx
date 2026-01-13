"use client"

import { useState } from "react"
import type { Element } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BarChart, LineChart, PieChart, Plus, Minus } from "lucide-react"

interface ChartEditorProps {
  onAddChart: (type: string) => void
  selectedElement: Element | null
  onUpdateElement: (element: Element) => void
}

export default function ChartEditor({ onAddChart, selectedElement, onUpdateElement }: ChartEditorProps) {
  const [activeTab, setActiveTab] = useState("type")

  const isChartSelected = selectedElement?.type === "chart"

  const updateChartData = (index: number, field: string, value: string) => {
    if (!isChartSelected) return

    const chartData = [...JSON.parse(selectedElement.content)]
    chartData[index][field] = field === "value" ? Number(value) : value

    onUpdateElement({
      ...selectedElement,
      content: JSON.stringify(chartData),
    })
  }

  const addDataPoint = () => {
    if (!isChartSelected) return

    const chartData = [...JSON.parse(selectedElement.content)]
    chartData.push({ label: "Новые данные", value: 0 }) // Перевел: "新数据"

    onUpdateElement({
      ...selectedElement,
      content: JSON.stringify(chartData),
    })
  }

  const removeDataPoint = (index: number) => {
    if (!isChartSelected) return

    const chartData = [...JSON.parse(selectedElement.content)]
    chartData.splice(index, 1)

    onUpdateElement({
      ...selectedElement,
      content: JSON.stringify(chartData),
    })
  }

  const updateChartStyle = (property: string, value: any) => {
    if (!isChartSelected) return

    onUpdateElement({
      ...selectedElement,
      style: {
        ...selectedElement.style,
        [property]: value,
      },
    })
  }

  const renderChartControls = () => {
    if (!isChartSelected) {
      return <div className="text-center text-muted-foreground p-2">Сначала выберите элемент диаграммы</div> // Перевел: "请先选择图表元素"
    }

    const chartData = JSON.parse(selectedElement.content)
    const chartType = selectedElement.style.chartType || "bar"

    return (
      <div>
        <div className="mb-4">
          <Label>Тип диаграммы</Label> {/* Перевел: "图表类型" */}
          <div className="flex space-x-2 mt-1">
            <Button
              variant={chartType === "bar" ? "default" : "outline"}
              size="sm"
              onClick={() => updateChartStyle("chartType", "bar")}
            >
              <BarChart className="h-4 w-4 mr-2" />
              Столбчатая {/* Перевел: "柱状图" */}
            </Button>
            <Button
              variant={chartType === "line" ? "default" : "outline"}
              size="sm"
              onClick={() => updateChartStyle("chartType", "line")}
            >
              <LineChart className="h-4 w-4 mr-2" />
              Линейная {/* Перевел: "折线图" */}
            </Button>
            <Button
              variant={chartType === "pie" ? "default" : "outline"}
              size="sm"
              onClick={() => updateChartStyle("chartType", "pie")}
            >
              <PieChart className="h-4 w-4 mr-2" />
              Круговая {/* Перевел: "饼图" */}
            </Button>
          </div>
        </div>

        <div className="mb-4">
          <div className="flex justify-between items-center">
            <Label>Данные</Label> {/* Перевел: "数据" */}
            <Button size="sm" variant="outline" onClick={addDataPoint}>
              <Plus className="h-4 w-4 mr-2" />
              Добавить данные {/* Перевел: "添加数据" */}
            </Button>
          </div>

          <div className="space-y-2 mt-2">
            {chartData.map((item: any, index: number) => (
              <div key={index} className="flex items-center space-x-2">
                <Input
                  value={item.label}
                  onChange={(e) => updateChartData(index, "label", e.target.value)}
                  placeholder="Метка" {/* Перевел: "标签" */}
                  className="flex-1"
                />
                <Input
                  type="number"
                  value={item.value}
                  onChange={(e) => updateChartData(index, "value", e.target.value)}
                  placeholder="Значение" {/* Перевел: "数值" */}
                  className="w-24"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeDataPoint(index)}
                  disabled={chartData.length <= 1}
                >
                  <Minus className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="title">Заголовок</Label> {/* Перевел: "标题" */}
            <Input
              id="title"
              value={selectedElement.style.title || ""}
              onChange={(e) => updateChartStyle("title", e.target.value)}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="chart-color">Цвет темы</Label> {/* Перевел: "主题颜色" */}
            <Input
              id="chart-color"
              type="color"
              value={selectedElement.style.color || "#3b82f6"}
              onChange={(e) => updateChartStyle("color", e.target.value)}
              className="mt-1 h-9"
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-2 w-full">
          <TabsTrigger value="type">Типы диаграмм</TabsTrigger> {/* Перевел: "图表类型" */}
          <TabsTrigger value="data">Редактирование данных</TabsTrigger> {/* Перевел: "数据编辑" */}
        </TabsList>

        <TabsContent value="type" className="mt-2">
          <div className="grid grid-cols-3 gap-2">
            <Button
              variant="outline"
              className="flex flex-col items-center p-4 h-auto"
              onClick={() => onAddChart("bar")}
            >
              <BarChart className="h-8 w-8 mb-2" />
              Столбчатая {/* Перевел: "柱状图" */}
            </Button>
            <Button
              variant="outline"
              className="flex flex-col items-center p-4 h-auto"
              onClick={() => onAddChart("line")}
            >
              <LineChart className="h-8 w-8 mb-2" />
              Линейная {/* Перевел: "折线图" */}
            </Button>
            <Button
              variant="outline"
              className="flex flex-col items-center p-4 h-auto"
              onClick={() => onAddChart("pie")}
            >
              <PieChart className="h-8 w-8 mb-2" />
              Круговая {/* Перевел: "饼图" */}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="data" className="mt-2">
          {renderChartControls()}
        </TabsContent>
      </Tabs>
    </div>
  )
}